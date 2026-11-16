import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

// Una fila por cada línea del "Registro de fechas de fabricación de goteros"
export const registros = pgTable("registros", {
  id: serial().primaryKey(),
  maquina: text().notNull().default(""),
  hoja: text().notNull().default(""),
  descripcion: text().notNull().default(""),
  fechaInsertadora: text("fecha_insertadora").notNull().default(""),
  hora: text().notNull().default(""),
  fechaFabricacion: text("fecha_fabricacion").notNull().default(""),
  attention: text().notNull().default(""),
  cajas: integer(),
  observaciones: text().notNull().default(""),
  foto: text().notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
