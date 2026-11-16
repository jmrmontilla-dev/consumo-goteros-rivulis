import type { Config } from "@netlify/functions";
import ExcelJS from "exceljs";
import { asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registros } from "../../db/schema.js";

// Convierte "DD/MM/AAAA" en fecha real de Excel; si no se puede, deja el texto
const toDate = (s: string): Date | string => {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return s;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d : s;
};

export default async () => {
  const rows = await db.select().from(registros).orderBy(asc(registros.id));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro de goteros";

  // Agrupa las filas según el encabezado leído de cada hoja escaneada (máquina)
  const grupos = new Map<string, typeof rows>();
  for (const r of rows) {
    const m = r.maquina.trim().toUpperCase().replace(/^M[ÁA]QUINA\s*/, "");
    const nombre = (m ? `Máquina ${m}` : "Sin máquina").replace(/[\\/?*\[\]:]/g, "-").slice(0, 31);
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre)!.push(r);
  }
  if (!grupos.size) grupos.set("Registro goteros", []);
  const nombres = [...grupos.keys()].sort((x, y) => x.localeCompare(y, "es", { numeric: true }));

  for (const nombre of nombres) {
    const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "Nº", key: "id", width: 7 },
      { header: "Máquina", key: "maquina", width: 10 },
      { header: "Hoja", key: "hoja", width: 8 },
      { header: "Descripción gotero", key: "descripcion", width: 26 },
      { header: "Fecha caja a insertadora", key: "fechaInsertadora", width: 16, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Hora caja a insertadora", key: "hora", width: 13 },
      { header: "Fecha fabricación (Assembly Date)", key: "fechaFabricacion", width: 18, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Lote JAIN / ATTENTION-posición-operario", key: "attention", width: 30 },
      { header: "Cajas", key: "cajas", width: 8 },
      { header: "Observaciones", key: "observaciones", width: 40 },
      { header: "Foto", key: "foto", width: 22 },
      { header: "Registrado", key: "createdAt", width: 18, style: { numFmt: "dd/mm/yyyy hh:mm" } },
    ];
    for (const r of grupos.get(nombre)!) {
      ws.addRow({ ...r, fechaInsertadora: toDate(r.fechaInsertadora), fechaFabricacion: toDate(r.fechaFabricacion) });
    }
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    header.height = 36;
    header.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E5A4A" } };
    });
    ws.autoFilter = { from: "A1", to: "L1" };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="registro-goteros-${fecha}.xlsx"`,
    },
  });
};

export const config: Config = { path: "/api/excel" };
