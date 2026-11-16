CREATE TABLE "registros" (
	"id" serial PRIMARY KEY,
	"maquina" text DEFAULT '' NOT NULL,
	"hoja" text DEFAULT '' NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"fecha_insertadora" text DEFAULT '' NOT NULL,
	"hora" text DEFAULT '' NOT NULL,
	"fecha_fabricacion" text DEFAULT '' NOT NULL,
	"attention" text DEFAULT '' NOT NULL,
	"cajas" integer,
	"observaciones" text DEFAULT '' NOT NULL,
	"foto" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
