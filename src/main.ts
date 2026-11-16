import "./style.css";

type Fila = {
  descripcion: string;
  fechaInsertadora: string;
  hora: string;
  fechaFabricacion: string;
  attention: string;
  cajas: number | null;
  observaciones: string;
  maquina?: string;
  hoja?: string;
  foto?: string;
};

type Registro = Fila & { id: number; createdAt: string };

type Foto = {
  id: string;
  name: string;
  dataUrl: string;
  estado: "pendiente" | "leyendo" | "ok" | "error";
  error?: string;
};

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const fotos: Foto[] = [];
let filas: Fila[] = [];
let registros: Registro[] = [];

/* ---------- Utilidades ---------- */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let toastTimer = 0;
function toast(msg: string, kind: "ok" | "error" = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.className = "toast"), 3200);
}

// Reduce la foto para enviarla rápido (lado largo máx. 2000 px, JPEG)
async function comprimir(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const max = 2000;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- Pestañas ---------- */

document.querySelectorAll<HTMLButtonElement>(".tab").forEach((btn) =>
  btn.addEventListener("click", () => mostrarTab(btn.dataset.tab!)),
);

function mostrarTab(tab: string) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
  actualizarSavebar();
  if (tab === "hoja") cargarRegistros();
}

/* ---------- Paso 1: fotos ---------- */

async function añadirArchivos(list: FileList | null) {
  if (!list?.length) return;
  for (const file of Array.from(list)) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const dataUrl = await comprimir(file);
      fotos.push({ id: crypto.randomUUID(), name: `Foto ${fotos.length + 1}`, dataUrl, estado: "pendiente" });
    } catch {
      toast("No se pudo abrir una de las imágenes", "error");
    }
  }
  renderFotos();
}

$("#in-camera").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  await añadirArchivos(input.files);
  input.value = "";
});
$("#in-gallery").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  await añadirArchivos(input.files);
  input.value = "";
});

const estadoTxt: Record<Foto["estado"], string> = {
  pendiente: "Lista",
  leyendo: "Leyendo…",
  ok: "Leída",
  error: "Error",
};

function renderFotos() {
  const ul = $("#thumbs");
  ul.innerHTML = fotos
    .map(
      (f) => `
      <li class="thumb ${f.estado}">
        <img src="${f.dataUrl}" alt="${esc(f.name)}" />
        <span class="tag">${esc(f.name)} · ${estadoTxt[f.estado]}</span>
        ${f.estado !== "leyendo" ? `<button class="x" data-id="${f.id}" aria-label="Quitar foto">×</button>` : ""}
        ${f.estado === "leyendo" ? `<span class="scan"></span>` : ""}
      </li>`,
    )
    .join("");
  ul.querySelectorAll<HTMLButtonElement>(".x").forEach((b) =>
    b.addEventListener("click", () => {
      const i = fotos.findIndex((f) => f.id === b.dataset.id);
      if (i >= 0) fotos.splice(i, 1);
      renderFotos();
    }),
  );
  const pendientes = fotos.filter((f) => f.estado === "pendiente" || f.estado === "error").length;
  const btn = $<HTMLButtonElement>("#btn-leer");
  btn.disabled = pendientes === 0 || fotos.some((f) => f.estado === "leyendo");
  btn.textContent = pendientes ? `Leer ${pendientes} foto${pendientes > 1 ? "s" : ""} con IA` : "Leer fotos con IA";
}

$("#btn-leer").addEventListener("click", async () => {
  const cola = fotos.filter((f) => f.estado === "pendiente" || f.estado === "error");
  $("#step-revisar").hidden = false;
  for (const foto of cola) {
    foto.estado = "leyendo";
    renderFotos();
    renderReview();
    try {
      const res = await fetch("/api/extraer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: foto.dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al leer la foto");
      const nuevas: Fila[] = (data.filas ?? []).map((r: Fila) => ({
        ...r,
        maquina: data.maquina ?? "",
        hoja: data.hoja ?? "",
        foto: foto.name,
      }));
      filas.push(...nuevas);
      foto.estado = "ok";
      toast(`${foto.name}: ${nuevas.length} filas leídas`);
    } catch (err) {
      foto.estado = "error";
      foto.error = (err as Error).message;
      toast(`${foto.name}: ${foto.error}`, "error");
    }
    renderFotos();
    renderReview();
  }
});

/* ---------- Paso 2: revisión ---------- */

const campos: { key: keyof Fila; label: string; cls?: string; type?: string; ph?: string }[] = [
  { key: "descripcion", label: "Descripción gotero", cls: "full", ph: "AMNON AS 1.6" },
  { key: "fechaInsertadora", label: "Fecha caja", ph: "DD/MM/AAAA" },
  { key: "hora", label: "Hora", ph: "HH:MM" },
  { key: "fechaFabricacion", label: "F. fabricación", ph: "DD/MM/AAAA" },
  { key: "cajas", label: "Cajas", type: "number" },
  { key: "attention", label: "Lote JAIN / Attention", cls: "full", ph: "260383 J  ·  10-4-318R" },
  { key: "observaciones", label: "Observaciones", cls: "full" },
];

function renderReview() {
  const cont = $("#review");
  const leyendo = fotos.some((f) => f.estado === "leyendo");
  if (!filas.length && !leyendo) {
    cont.innerHTML = `<div class="empty">Aún no hay filas. Lee una foto o añade una fila a mano.</div>`;
  } else {
    cont.innerHTML =
      filas
        .map(
          (f, i) => `
        <article class="row-card ${f.observaciones ? "doubt" : ""}" style="--d:${Math.min(i, 12) * 30}ms">
          <header>
            <span class="row-n">${String(i + 1).padStart(2, "0")}</span>
            <span class="row-src">${esc(f.foto || "Manual")}${f.maquina ? ` · máquina ${esc(f.maquina)}` : ""}${f.hoja ? ` · hoja ${esc(f.hoja)}` : ""}</span>
            <button class="del" data-i="${i}" aria-label="Eliminar fila">Eliminar</button>
          </header>
          <div class="grid">
            ${campos
              .map(
                (c) => `
              <label class="${c.cls ?? ""}">
                <span>${c.label}</span>
                <input data-i="${i}" data-k="${c.key}" type="${c.type ?? "text"}" ${c.type === "number" ? 'inputmode="numeric"' : ""}
                  placeholder="${c.ph ?? ""}" value="${esc(f[c.key] ?? "")}" />
              </label>`,
              )
              .join("")}
          </div>
        </article>`,
        )
        .join("") + (leyendo ? `<div class="skeleton"></div><div class="skeleton"></div>` : "");
  }

  cont.querySelectorAll<HTMLInputElement>("input").forEach((inp) =>
    inp.addEventListener("input", () => {
      const f = filas[Number(inp.dataset.i)];
      const k = inp.dataset.k as keyof Fila;
      (f as Record<string, unknown>)[k] = k === "cajas" ? (inp.value === "" ? null : Number(inp.value)) : inp.value;
    }),
  );
  cont.querySelectorAll<HTMLButtonElement>(".del").forEach((b) =>
    b.addEventListener("click", () => {
      filas.splice(Number(b.dataset.i), 1);
      renderReview();
    }),
  );
  actualizarSavebar();
}

$("#btn-add-row").addEventListener("click", () => {
  const prev = filas[filas.length - 1];
  filas.push({
    descripcion: prev?.descripcion ?? "",
    fechaInsertadora: prev?.fechaInsertadora ?? "",
    hora: "",
    fechaFabricacion: prev?.fechaFabricacion ?? "",
    attention: prev?.attention ?? "",
    cajas: null,
    observaciones: "",
    maquina: prev?.maquina ?? "3",
    hoja: prev?.hoja ?? "",
    foto: "Manual",
  });
  $("#step-revisar").hidden = false;
  renderReview();
  document.querySelector(".row-card:last-of-type input")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

function actualizarSavebar() {
  const enCaptura = $("#panel-capturar").classList.contains("active");
  $("#savebar").hidden = !enCaptura || filas.length === 0;
  $("#save-info").textContent = `${filas.length} fila${filas.length === 1 ? "" : "s"} por guardar`;
}

$("#btn-save").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("#btn-save");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const res = await fetch("/api/registros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filas }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo guardar");
    toast(`${data.guardadas} filas añadidas a la hoja`);
    filas = [];
    fotos.splice(0, fotos.length);
    renderFotos();
    renderReview();
    $("#step-revisar").hidden = true;
    mostrarTab("hoja");
  } catch (err) {
    toast((err as Error).message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Añadir al Excel";
  }
});

/* ---------- Hoja ---------- */

async function cargarRegistros() {
  try {
    const res = await fetch("/api/registros");
    if (!res.ok) throw new Error();
    registros = await res.json();
  } catch {
    $("#sheet-summary").textContent = "No se pudo cargar la hoja";
    return;
  }
  renderHoja();
}

function renderHoja() {
  $("#count-badge").textContent = String(registros.length);
  const q = $<HTMLInputElement>("#search").value.trim().toLowerCase();
  const lista = q
    ? registros.filter((r) =>
        [r.descripcion, r.attention, r.fechaInsertadora, r.fechaFabricacion, r.hora, r.hoja]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : registros;

  $("#sheet-summary").textContent = registros.length
    ? `${registros.length} filas registradas${q ? ` · ${lista.length} coinciden` : ""}`
    : "La hoja está vacía";

  const body = $("#sheet-body");
  if (!lista.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty-cell">${
      registros.length ? "Sin resultados" : "Haz fotos de las hojas de registro para empezar a rellenar el Excel."
    }</td></tr>`;
    return;
  }
  body.innerHTML = lista
    .map(
      (r) => `
      <tr title="${esc(r.observaciones)}" class="${r.observaciones ? "doubt" : ""}">
        <td class="mono">${r.id}</td>
        <td class="mono">${esc(r.hoja)}</td>
        <td><b>${esc(r.descripcion)}</b></td>
        <td class="mono">${esc(r.fechaInsertadora)}</td>
        <td class="mono">${esc(r.hora)}</td>
        <td class="mono">${esc(r.fechaFabricacion)}</td>
        <td class="mono">${esc(r.attention)}</td>
        <td class="mono">${r.cajas ?? ""}</td>
        <td><button class="del-row" data-id="${r.id}" aria-label="Borrar fila">×</button></td>
      </tr>`,
    )
    .join("");
  body.querySelectorAll<HTMLButtonElement>(".del-row").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("¿Borrar esta fila del Excel?")) return;
      const res = await fetch(`/api/registros?ids=${b.dataset.id}`, { method: "DELETE" });
      if (res.ok) {
        registros = registros.filter((r) => r.id !== Number(b.dataset.id));
        renderHoja();
        toast("Fila borrada");
      } else toast("No se pudo borrar", "error");
    }),
  );
}

$("#search").addEventListener("input", renderHoja);

renderFotos();
cargarRegistros();
