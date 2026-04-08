
-- Tabla para registrar préstamos y adelantos de nómina
CREATE TABLE IF NOT EXISTS public.adelantos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empleado_id UUID NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  monto DECIMAL(10, 2) NOT NULL, -- Monto siempre en Bolívares o Dólares (según moneda base, asumiremos Bs por ahora para deducir directo)
  fecha_solicitud DATE DEFAULT CURRENT_DATE,
  motivo TEXT,
  estado TEXT CHECK (estado IN ('pendiente', 'aprobado', 'pagado', 'rechazado')) DEFAULT 'pendiente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Políticas de Seguridad (RLS)
ALTER TABLE public.adelantos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura a todos los autenticados" ON public.adelantos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir insertar a usuarios autenticados" ON public.adelantos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Permitir actualizar a usuarios autenticados" ON public.adelantos
  FOR UPDATE USING (auth.role() = 'authenticated');
