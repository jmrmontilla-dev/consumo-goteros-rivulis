import type { Config } from "@netlify/functions";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registros } from "../../db/schema.js";

type Fila = typeof registros.$inferInsert;

const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 500) : "");
const clean = (f: Record<string, unknown>): Fila => {
  const cajas = Number.parseInt(String(f.cajas ?? ""), 10);
  return {
    maquina: str(f.maquina),
    hoja: str(f.hoja),
    descripcion: str(f.descripcion),
    fechaInsertadora: str(f.fechaInsertadora),
    hora: str(f.hora),
    fechaFabricacion: str(f.fechaFabricacion),
    attention: str(f.attention),
    cajas: Number.isFinite(cajas) ? cajas : null,
    observaciones: str(f.observaciones),
    foto: str(f.foto),
  };
};

export default async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const rows = await db.select().from(registros).orderBy(desc(registros.id));
    return Response.json(rows);
  }

  if (req.method === "POST") {
    const body = (await req.json()) as { filas?: Record<string, unknown>[] };
    const filas = (body.filas ?? []).map(clean).filter((f) => f.descripcion || f.hora || f.fechaInsertadora);
    if (!filas.length) return Response.json({ error: "No hay filas para guardar" }, { status: 400 });
    const inserted = await db.insert(registros).values(filas).returning({ id: registros.id });
    return Response.json({ guardadas: inserted.length }, { status: 201 });
  }

  if (req.method === "PUT") {
    const id = Number(url.searchParams.get("id"));
    if (!id) return Response.json({ error: "Falta id" }, { status: 400 });
    const [row] = await db.update(registros).set(clean(await req.json())).where(eq(registros.id, id)).returning();
    return Response.json(row);
  }

  if (req.method === "DELETE") {
    const ids = (url.searchParams.get("ids") ?? "").split(",").map(Number).filter(Boolean);
    if (!ids.length) return Response.json({ error: "Falta id" }, { status: 400 });
    await db.delete(registros).where(inArray(registros.id, ids));
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = { path: "/api/registros" };
