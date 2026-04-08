# NominaPro - Instrucciones y Migraciones SQL Consolidadas

Este archivo consolida todas las instrucciones, migraciones SQL y documentación del proyecto.

---

## Base de Datos Principal (database.md)

```sql
-- 1. Tablas Principales
CREATE TABLE IF NOT EXISTS configuracion_global (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tasa_bcv NUMERIC(10, 4) DEFAULT 36.00,
    cestaticket_usd NUMERIC(10, 2) DEFAULT 40.00,
    salario_minimo_vef NUMERIC(15, 2) DEFAULT 130.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO configuracion_global (tasa_bcv, cestaticket_usd, salario_minimo_vef)
VALUES (36.50, 40.00, 130.00)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS perfiles_admin (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empleados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cedula TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    cargo TEXT,
    fecha_ingreso DATE NOT NULL,
    salario_usd NUMERIC(15, 2) DEFAULT 0.00,
    activo BOOLEAN DEFAULT TRUE,
    foto_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asistencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID REFERENCES empleados(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    estado TEXT CHECK (estado IN ('presente', 'falta', 'reposo', 'vacaciones')),
    observaciones TEXT,
    UNIQUE(empleado_id, fecha)
);

CREATE TABLE IF NOT EXISTS nominas_mensuales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID REFERENCES empleados(id),
    mes INTEGER NOT NULL,
    anio INTEGER NOT NULL,
    dias_trabajados INTEGER DEFAULT 30,
    tasa_aplicada NUMERIC(10, 4),
    sueldo_base_vef NUMERIC(15, 2),
    bono_alimentacion_vef NUMERIC(15, 2),
    deduccion_ivss NUMERIC(15, 2),
    deduccion_faov NUMERIC(15, 2),
    deduccion_spf NUMERIC(15, 2),
    neto_pagar_vef NUMERIC(15, 2),
    pagado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Seguridad (RLS)
ALTER TABLE perfiles_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominas_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_global ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON perfiles_admin
    FOR ALL TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admin manage employees" ON empleados
    FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM perfiles_admin WHERE id = auth.uid()));
CREATE POLICY "Admin manage payroll" ON nominas_mensuales
    FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM perfiles_admin WHERE id = auth.uid()));
CREATE POLICY "Admin manage attendance" ON asistencias
    FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM perfiles_admin WHERE id = auth.uid()));
CREATE POLICY "Admin view config" ON configuracion_global
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Admin update config" ON configuracion_global
    FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM perfiles_admin WHERE id = auth.uid()));

-- 3. Trigger para crear perfil automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfiles_admin (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

---

## Migracion 001: Expedientes y RIF

```sql
ALTER TABLE empleados
ADD COLUMN IF NOT EXISTS rif TEXT,
ADD COLUMN IF NOT EXISTS cv_url TEXT;

INSERT INTO storage.buckets (id, name, public)
SELECT 'expedientes', 'expedientes', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'expedientes');

CREATE POLICY "Admins pueden subir expedientes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'expedientes');

CREATE POLICY "Admins pueden ver expedientes"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'expedientes');

CREATE POLICY "Admins pueden gestionar expedientes"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'expedientes');
```

---

## Migracion 002: Bucket publico y precision salarial

```sql
UPDATE storage.buckets SET public = true WHERE id = 'expedientes';

CREATE POLICY "Acceso publico a fotos de empleados"
ON storage.objects FOR SELECT
USING (bucket_id = 'expedientes');

ALTER TABLE empleados ALTER COLUMN salario_usd TYPE NUMERIC(15, 2);
```

---

## Migracion 003: Control horario y faltas automaticas

```sql
ALTER TABLE asistencias
ADD COLUMN IF NOT EXISTS hora_entrada TIME,
ADD COLUMN IF NOT EXISTS hora_salida TIME;

CREATE OR REPLACE FUNCTION marcar_inasistencias_del_dia()
RETURNS void AS $$
BEGIN
    INSERT INTO asistencias (empleado_id, fecha, estado, observaciones)
    SELECT e.id, CURRENT_DATE, 'falta', 'Marcado automaticamente por sistema (Despues de las 16:00)'
    FROM empleados e
    WHERE e.activo = TRUE
    AND NOT EXISTS (
        SELECT 1 FROM asistencias a
        WHERE a.empleado_id = e.id AND a.fecha = CURRENT_DATE
    )
    AND CURRENT_TIME > '16:00:00'::TIME;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Migracion 004: Relacion empleados-sucursales

```sql
ALTER TABLE empleados
ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_empleados_sucursal ON empleados(sucursal_id);
```

---

## Migracion 005: Campos personales y cargas familiares

```sql
ALTER TABLE empleados
ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
ADD COLUMN IF NOT EXISTS lugar_nacimiento TEXT,
ADD COLUMN IF NOT EXISTS nacionalidad TEXT DEFAULT 'Venezolana',
ADD COLUMN IF NOT EXISTS sexo TEXT CHECK (sexo IN ('M', 'F', 'Otro')),
ADD COLUMN IF NOT EXISTS estado_civil TEXT CHECK (estado_civil IN ('Soltero', 'Casado', 'Divorciado', 'Viudo', 'Concubinato')),
ADD COLUMN IF NOT EXISTS direccion_habitacion TEXT,
ADD COLUMN IF NOT EXISTS telefono_movil TEXT,
ADD COLUMN IF NOT EXISTS telefono_fijo TEXT,
ADD COLUMN IF NOT EXISTS email_personal TEXT,
ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre TEXT,
ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono TEXT,
ADD COLUMN IF NOT EXISTS tipo_contrato TEXT DEFAULT 'Indeterminado',
ADD COLUMN IF NOT EXISTS departamento TEXT,
ADD COLUMN IF NOT EXISTS tipo_jornada TEXT DEFAULT 'Tiempo Completo',
ADD COLUMN IF NOT EXISTS salario_base_vef NUMERIC(15, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS bono_alimentacion_frecuencia TEXT DEFAULT 'Mensual';

CREATE TABLE IF NOT EXISTS cargas_familiares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID REFERENCES empleados(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    parentesco TEXT CHECK (parentesco IN ('Hijo', 'Hija', 'Conyuge', 'Padre', 'Madre')),
    fecha_nacimiento DATE,
    es_menor BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE cargas_familiares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage family" ON cargas_familiares
    FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM perfiles_admin WHERE id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_cargas_empleado ON cargas_familiares(empleado_id);
```

---

## Migracion 006: Fecha inicio contrato

```sql
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS fecha_inicio_contrato DATE;
```

---

## Migracion 007: RIF, departamento y salario base

```sql
ALTER TABLE empleados
ADD COLUMN IF NOT EXISTS rif TEXT,
ADD COLUMN IF NOT EXISTS departamento TEXT,
ADD COLUMN IF NOT EXISTS salario_base_vef NUMERIC(15, 2) DEFAULT 0.00;

UPDATE empleados SET cargo = 'General' WHERE cargo IS NULL OR cargo = '';
CREATE INDEX IF NOT EXISTS idx_empleados_id_fiscal ON empleados(cedula, rif);
```

---

## Migracion 008: Campos sucursales (RIF y principal)

```sql
ALTER TABLE sucursales
ADD COLUMN IF NOT EXISTS rif TEXT,
ADD COLUMN IF NOT EXISTS es_principal BOOLEAN DEFAULT FALSE;
```

---

## Migracion 009: Storage logos

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('expedientes', 'expedientes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Permitir carga de logos en folder logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'expedientes' AND (storage.foldername(name))[1] = 'logos');

CREATE POLICY "Permitir actualizacion de logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'expedientes');

CREATE POLICY "Lectura publica de logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'expedientes');
```

---

## Migracion 010: Optimizacion asistencias y cierre nomina

```sql
CREATE INDEX IF NOT EXISTS idx_asistencias_consulta_calendario
ON asistencias(empleado_id, fecha DESC);

ALTER TABLE asistencias ADD COLUMN IF NOT EXISTS cerrado BOOLEAN DEFAULT FALSE;

ALTER TABLE asistencias
ADD CONSTRAINT check_horas_logicas
CHECK (hora_salida IS NULL OR hora_salida >= hora_entrada);
```

---

## Migracion 011: Beneficios LOTTT y prestaciones

```sql
ALTER TABLE configuracion_global
ADD COLUMN IF NOT EXISTS dias_utilidades INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS dias_bono_vacacional_base INTEGER DEFAULT 15;

ALTER TABLE empleados
ADD COLUMN IF NOT EXISTS prestaciones_acumuladas_vef NUMERIC(18, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS ultima_actualizacion_prestaciones DATE;
```

---

## Migracion 012: Roles y permisos

```sql
CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

INSERT INTO roles (name) VALUES ('admin'), ('manager'), ('employee');
```

---

## Tabla de Sucursales (sucursal.md)

```sql
CREATE TABLE IF NOT EXISTS sucursales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_id TEXT NOT NULL,
    direccion TEXT NOT NULL,
    administrador TEXT NOT NULL,
    correo_admin TEXT NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pueden gestionar sucursales"
ON sucursales FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM perfiles_admin WHERE id = auth.uid()));

CREATE POLICY "Logos acceso publico"
ON storage.objects FOR SELECT USING (bucket_id = 'expedientes');

CREATE POLICY "Admins pueden subir logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'expedientes');
```

---

## Autenticacion (instrucciones_auth.md)

### Vinculacion Auth -> Base de Datos
Un Trigger en PostgreSQL se dispara cada vez que un usuario se registra en `auth.users` e inserta automaticamente el `user_id` en `perfiles_admin`.

### Flujo de Login
```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@farmacia.com',
  password: 'password123',
})
```

### Seguridad de Datos (RLS)
Las politicas RLS aseguran que solo usuarios cuya ID este en `perfiles_admin` puedan leer `empleados` y procesar `nominas_mensuales`.

### Gestion de Expedientes (Storage)
El bucket `expedientes` debe crearse con visibilidad privada. Las politicas validan que `auth.uid()` pertenezca a un administrador activo.
