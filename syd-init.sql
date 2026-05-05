-- ================================
-- SYD – Seed Your Dreams
-- Init SQL completo: schema + datos
-- ================================

-- 1. Tablas base
CREATE TABLE poles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  description TEXT
);

CREATE TABLE avatars (
  id SERIAL PRIMARY KEY,
  pole_id INT REFERENCES poles(id),
  name VARCHAR(50) NOT NULL,
  country VARCHAR(50),
  is_vip BOOLEAN DEFAULT FALSE,
  is_visible BOOLEAN DEFAULT TRUE,
  financial_trait VARCHAR(100)
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  pole_id INT REFERENCES poles(id),
  avatar_id INT REFERENCES avatars(id),
  xp INT DEFAULT 0,
  level INT DEFAULT 1
);

CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  pole_id INT REFERENCES poles(id),
  name VARCHAR(100) NOT NULL,
  description TEXT
);

CREATE TABLE missions (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  duration_sec INT NOT NULL,
  reward_xp INT DEFAULT 0,
  reward_item VARCHAR(50)
);

CREATE TABLE submissions (
  id SERIAL PRIMARY KEY,
  mission_id INT REFERENCES missions(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  duration_sec INT NOT NULL,
  reward_xp INT DEFAULT 0,
  reward_item VARCHAR(50)
);

CREATE TABLE user_progress (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  mission_id INT REFERENCES missions(id),
  submission_id INT REFERENCES submissions(id),
  status VARCHAR(20) DEFAULT 'in_progress',
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  reward_claimed BOOLEAN DEFAULT FALSE
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  type VARCHAR(20),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  reward_xp INT DEFAULT 0
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  pole_id INT REFERENCES poles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id INT REFERENCES posts(id),
  user_id INT REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================
-- 2. Polos
-- ================================
INSERT INTO poles (id, name, description) VALUES
(1, 'Norte', 'Ahorro y Disciplina'),
(2, 'Sur', 'Inversión y Crecimiento'),
(3, 'Este', 'Innovación y Riesgo Calculado'),
(4, 'Oeste', 'Seguridad y Preservación');

-- ================================
-- 3. Animales VIP (guías)
-- ================================
INSERT INTO avatars (pole_id, name, is_vip, is_visible, financial_trait) VALUES
(1, 'Hormiga', TRUE, FALSE, 'Constancia y Ahorro'),
(2, 'Toro/Árbol', TRUE, FALSE, 'Crecimiento sostenido'),
(3, 'Lobo', TRUE, FALSE, 'Estrategia y Riesgo Calculado'),
(4, 'Búho', TRUE, FALSE, 'Sabiduría y Protección');

-- ================================
-- 4. Norte – Ahorro & Disciplina
-- ================================
INSERT INTO avatars (pole_id, name, country, is_vip, is_visible, financial_trait) VALUES
(1, 'Llama', 'Bolivia', FALSE, TRUE, 'Resistencia y planificación'),
(1, 'Bisonte Americano', 'EEUU', FALSE, TRUE, 'Resiliencia'),
(1, 'Tortuga', 'Global', FALSE, TRUE, 'Paciencia y Largo Plazo'),
(1, 'Vicuña', 'Perú', FALSE, FALSE, 'Valor y eficiencia'),
(1, 'Venado Cola Blanca', 'Centroamérica', FALSE, FALSE, 'Austeridad y buena fortuna'),
(1, 'Elefante', 'África/Asia', FALSE, FALSE, 'Estabilidad y memoria'),
(1, 'Koala', 'Australia', FALSE, FALSE, 'Simplicidad y calma'),
(1, 'Kiwi', 'Nueva Zelanda', FALSE, FALSE, 'Identidad y singularidad');

-- ================================
-- 5. Sur – Inversión & Crecimiento
-- ================================
INSERT INTO avatars (pole_id, name, country, is_vip, is_visible, financial_trait) VALUES
(2, 'Águila Calva', 'EEUU', FALSE, TRUE, 'Ambición y visión'),
(2, 'Jaguar', 'México/Brasil', FALSE, TRUE, 'Poder y agresividad'),
(2, 'Canguro', 'Australia', FALSE, TRUE, 'Saltos de crecimiento'),
(2, 'Quetzal', 'Guatemala', FALSE, TRUE, 'Prosperidad y valor cultural'),
(2, 'Cóndor Andino', 'Andes', FALSE, FALSE, 'Grandeza y libertad'),
(2, 'León', 'África', FALSE, FALSE, 'Liderazgo y dominio'),
(2, 'Panda Gigante', 'China', FALSE, FALSE, 'Prosperidad y conservación'),
(2, 'Dragón de Komodo', 'Indonesia', FALSE, FALSE, 'Poder natural'),
(2, 'Paloma Imperial', 'Tonga', FALSE, FALSE, 'Prosperidad en comunidad');

-- ================================
-- 6. Este – Innovación & Riesgo Calculado
-- ================================
INSERT INTO avatars (pole_id, name, country, is_vip, is_visible, financial_trait) VALUES
(3, 'Okapi', 'RDC', FALSE, TRUE, 'Singularidad e innovación'),
(3, 'Ibis Escarlata', 'Trinidad y Tobago', FALSE, TRUE, 'Excentricidad y originalidad'),
(3, 'Tigre de Bengala', 'Bangladés', FALSE, TRUE, 'Riesgo alto y agresividad'),
(3, 'Demonio de Tasmania', 'Australia', FALSE, TRUE, 'Impulsividad y caos'),
(3, 'Lémur de Cola Anillada', 'Madagascar', FALSE, FALSE, 'Adaptabilidad y rareza'),
(3, 'Dodo', 'Mauricio', FALSE, FALSE, 'Riesgo de extinción'),
(3, 'Abubilla', 'Israel', FALSE, FALSE, 'Originalidad'),
(3, 'Cabra Markhor', 'Pakistán', FALSE, FALSE, 'Audacia y desafío'),
(3, 'Faisán Verde', 'Japón', FALSE, FALSE, 'Innovación cultural'),
(3, 'Urraca de Formosa', 'Taiwán', FALSE, FALSE, 'Inteligencia y adaptación'),
(3, 'Lori Solitario', 'Fiyi', FALSE, FALSE, 'Vibrante y colorido');

-- ================================
-- 7. Oeste – Seguridad & Preservación
-- ================================
INSERT INTO avatars (pole_id, name, country, is_vip, is_visible, financial_trait) VALUES
(4, 'Oso Pardo', 'Finlandia', FALSE, TRUE, 'Protección y fuerza'),
(4, 'Caballo Mongol', 'Mongolia', FALSE, TRUE, 'Lealtad y resistencia'),
(4, 'Paloma Montaraz', 'Granada', FALSE, TRUE, 'Paz y estabilidad'),
(4, 'Águila Real', 'México/Jordania', FALSE, FALSE, 'Nobleza y estabilidad'),
(4, 'Bisonte Europeo', 'Bielorrusia', FALSE, FALSE, 'Robustez'),
(4, 'Alce', 'Ucrania', FALSE, FALSE, 'Resistencia'),
(4, 'Takín', 'Bután', FALSE, FALSE, 'Rareza y fuerza'),
(4, 'Faisán Chir', 'Nepal', FALSE, FALSE, 'Tradición y continuidad'),
(4, 'Paloma Manumea', 'Samoa', FALSE, FALSE, 'Identidad cultural');

-- ================================
-- POLO 1: NORTE – Ahorro & Disciplina
-- ================================
INSERT INTO campaigns (pole_id, name, description) VALUES
(1, 'El Presupuesto', 'Aprende a registrar y controlar ingresos y gastos.'),
(1, 'El Fondo de Emergencia', 'Construye un colchón financiero para imprevistos.'),
(1, 'Deuda Responsable', 'Aprende a diferenciar y manejar deudas.'),
(1, 'Hábitos de Consumo', 'Crea hábitos saludables en tu relación con el dinero.'),
(1, 'Metas Financieras', 'Define objetivos financieros claros y alcanzables.');

-- REINO 1: El Presupuesto
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1), 'Registra tus ingresos', 'Identifica todas tus fuentes de ingreso.', 300, 10),
((SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1), 'Registra tus gastos fijos', 'Controla tus gastos básicos e imprescindibles.', 300, 10),
((SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1), 'Registra tus gastos variables', 'Aprende a reconocer gastos cambiantes.', 300, 10),
((SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1), 'Calcula tu balance mensual', 'Analiza la diferencia entre ingresos y gastos.', 600, 20),
((SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1), 'Crea tu primer presupuesto', 'Diseña tu plan financiero mensual.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='Registra tus ingresos' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Lista de ingresos', 'Haz una lista de todas tus fuentes de ingresos.', 60, 5),
((SELECT id FROM missions WHERE name='Registra tus ingresos' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Clasificación', 'Clasifica ingresos en fijos y variables.', 120, 5),
((SELECT id FROM missions WHERE name='Registra tus ingresos' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Cálculo total', 'Calcula tu ingreso mensual total.', 120, 5),
((SELECT id FROM missions WHERE name='Registra tus gastos fijos' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Listado de gastos', 'Haz una lista de tus gastos fijos.', 60, 5),
((SELECT id FROM missions WHERE name='Registra tus gastos fijos' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Clasificación', 'Diferencia imprescindibles de opcionales.', 120, 5),
((SELECT id FROM missions WHERE name='Registra tus gastos fijos' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Cálculo total', 'Calcula tu gasto fijo mensual.', 120, 5),
((SELECT id FROM missions WHERE name='Registra tus gastos variables' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Listado de variables', 'Haz un listado de gastos variables.', 60, 5),
((SELECT id FROM missions WHERE name='Registra tus gastos variables' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Agrupación', 'Agrúpalos en categorías (ocio, compras).', 120, 5),
((SELECT id FROM missions WHERE name='Registra tus gastos variables' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Promedio mensual', 'Calcula el gasto medio mensual.', 120, 5),
((SELECT id FROM missions WHERE name='Calcula tu balance mensual' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Cálculo balance', 'Resta gastos a ingresos.', 120, 5),
((SELECT id FROM missions WHERE name='Calcula tu balance mensual' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Evaluación', 'Determina si es positivo o negativo.', 120, 5),
((SELECT id FROM missions WHERE name='Calcula tu balance mensual' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Análisis', 'Identifica puntos de mejora.', 180, 10),
((SELECT id FROM missions WHERE name='Crea tu primer presupuesto' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Definir límites', 'Define límites de gasto por categoría.', 180, 10),
((SELECT id FROM missions WHERE name='Crea tu primer presupuesto' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Aplicar regla 50/30/20', 'Ajusta tu presupuesto con esta regla.', 300, 10),
((SELECT id FROM missions WHERE name='Crea tu primer presupuesto' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Presupuesto' AND pole_id=1)), 'Plantilla mensual', 'Guarda tu presupuesto como plantilla.', 300, 10);

-- REINO 2: El Fondo de Emergencia
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1), '¿Qué es un fondo de emergencia?', 'Aprende el concepto y la utilidad.', 300, 10),
((SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1), 'Define tu meta de seguridad', 'Calcula cuántos meses cubrir.', 300, 10),
((SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1), 'Elige dónde guardar tu fondo', 'Decide la mejor cuenta o instrumento.', 300, 10),
((SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1), 'Haz un plan de aportes', 'Crea tu plan para acumularlo.', 600, 20),
((SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1), 'Simula un imprevisto', 'Pon a prueba tu fondo con un caso real.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='¿Qué es un fondo de emergencia?' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Definición', 'Lee qué significa un fondo de emergencia.', 60, 5),
((SELECT id FROM missions WHERE name='¿Qué es un fondo de emergencia?' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Importancia', 'Anota por qué es esencial.', 120, 5),
((SELECT id FROM missions WHERE name='¿Qué es un fondo de emergencia?' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Ejemplos', 'Piensa en imprevistos reales (médicos, despido).', 120, 5),
((SELECT id FROM missions WHERE name='Define tu meta de seguridad' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Gastos básicos', 'Calcula tus gastos mensuales.', 120, 5),
((SELECT id FROM missions WHERE name='Define tu meta de seguridad' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Multiplicador', 'Multiplica por 3-6 meses.', 120, 5),
((SELECT id FROM missions WHERE name='Define tu meta de seguridad' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Meta final', 'Anota tu meta total.', 180, 10),
((SELECT id FROM missions WHERE name='Elige dónde guardar tu fondo' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Opciones', 'Investiga cuentas y productos financieros.', 180, 10),
((SELECT id FROM missions WHERE name='Elige dónde guardar tu fondo' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Comparación', 'Compara liquidez y seguridad.', 180, 10),
((SELECT id FROM missions WHERE name='Elige dónde guardar tu fondo' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Selección', 'Elige la mejor opción.', 240, 10),
((SELECT id FROM missions WHERE name='Haz un plan de aportes' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Cuánto ahorrar', 'Decide cuánto ahorrar cada mes.', 120, 5),
((SELECT id FROM missions WHERE name='Haz un plan de aportes' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Recordatorio', 'Configura un recordatorio mensual.', 120, 5),
((SELECT id FROM missions WHERE name='Haz un plan de aportes' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Registro', 'Abre un registro de aportes.', 180, 10),
((SELECT id FROM missions WHERE name='Simula un imprevisto' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Escenario', 'Imagina perder tu empleo.', 180, 10),
((SELECT id FROM missions WHERE name='Simula un imprevisto' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Cálculo', 'Evalúa cuánto cubriría tu fondo.', 240, 10),
((SELECT id FROM missions WHERE name='Simula un imprevisto' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Fondo de Emergencia' AND pole_id=1)), 'Conclusión', 'Analiza si es suficiente.', 240, 10);

-- REINO 3: Deuda Responsable
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1), 'Diferencia deuda buena y mala', 'Aprende a distinguir qué deudas te benefician y cuáles te perjudican.', 300, 10),
((SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1), 'Lista tus deudas actuales', 'Haz un inventario claro de lo que debes.', 300, 10),
((SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1), 'Calcula tu ratio deuda/ingreso', 'Mide la sostenibilidad de tu nivel de deuda.', 300, 10),
((SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1), 'Estrategia bola de nieve vs avalancha', 'Descubre métodos de pago de deudas.', 600, 20),
((SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1), 'Diseña tu plan de pago', 'Crea tu estrategia personal para liberarte de deudas.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='Diferencia deuda buena y mala' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Ejemplos de deuda buena', 'Aprende cuáles son las deudas que pueden ayudarte.', 120, 5),
((SELECT id FROM missions WHERE name='Diferencia deuda buena y mala' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Ejemplos de deuda mala', 'Reconoce deudas dañinas como créditos de consumo caros.', 120, 5),
((SELECT id FROM missions WHERE name='Diferencia deuda buena y mala' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Clasifica tus deudas', 'Ordena tus deudas en buenas o malas.', 180, 10),
((SELECT id FROM missions WHERE name='Lista tus deudas actuales' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Listado completo', 'Anota todos los préstamos, tarjetas y créditos.', 120, 5),
((SELECT id FROM missions WHERE name='Lista tus deudas actuales' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Intereses y plazos', 'Incluye tasa de interés y duración.', 180, 10),
((SELECT id FROM missions WHERE name='Lista tus deudas actuales' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Ordenar', 'Ordena de mayor a menor interés.', 180, 10),
((SELECT id FROM missions WHERE name='Calcula tu ratio deuda/ingreso' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Suma de cuotas', 'Calcula el total de pagos mensuales.', 120, 5),
((SELECT id FROM missions WHERE name='Calcula tu ratio deuda/ingreso' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Divide', 'Divide el total de cuotas entre tus ingresos.', 120, 5),
((SELECT id FROM missions WHERE name='Calcula tu ratio deuda/ingreso' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Evaluación', 'Analiza si el ratio supera el 30%.', 180, 10),
((SELECT id FROM missions WHERE name='Estrategia bola de nieve vs avalancha' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Método bola de nieve', 'Aprende la estrategia de pagar deudas pequeñas primero.', 180, 10),
((SELECT id FROM missions WHERE name='Estrategia bola de nieve vs avalancha' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Método avalancha', 'Aprende la estrategia de pagar deudas con mayor interés primero.', 180, 10),
((SELECT id FROM missions WHERE name='Estrategia bola de nieve vs avalancha' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Comparación', 'Elige cuál se adapta mejor a tu perfil.', 240, 10),
((SELECT id FROM missions WHERE name='Diseña tu plan de pago' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Elige la deuda prioritaria', 'Define por dónde empezar.', 120, 5),
((SELECT id FROM missions WHERE name='Diseña tu plan de pago' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Planifica pagos extra', 'Decide si harás abonos adicionales.', 180, 10),
((SELECT id FROM missions WHERE name='Diseña tu plan de pago' AND campaign_id=(SELECT id FROM campaigns WHERE name='Deuda Responsable' AND pole_id=1)), 'Fecha objetivo', 'Proyecta cuándo estarás libre de deudas.', 240, 10);

-- REINO 4: Hábitos de Consumo
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1), 'Diferencia necesidades de deseos', 'Aprende a distinguir lo esencial de lo prescindible.', 300, 10),
((SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1), 'Identifica fugas de dinero', 'Reconoce pequeños gastos que drenan tu presupuesto.', 300, 10),
((SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1), 'Reto de 7 días sin gasto extra', 'Pon a prueba tu autocontrol financiero.', 600, 20),
((SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1), 'El poder del ahorro automático', 'Descubre cómo automatizar el ahorro.', 600, 20),
((SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1), 'Construye un hábito financiero', 'Convierte el buen manejo del dinero en rutina diaria.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='Diferencia necesidades de deseos' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Lista de esenciales', 'Haz una lista de gastos que son estrictamente necesarios.', 120, 5),
((SELECT id FROM missions WHERE name='Diferencia necesidades de deseos' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Lista de deseos', 'Haz otra lista con cosas que no son imprescindibles.', 120, 5),
((SELECT id FROM missions WHERE name='Diferencia necesidades de deseos' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Comparación', 'Compara ambas listas y reflexiona.', 180, 10),
((SELECT id FROM missions WHERE name='Identifica fugas de dinero' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Revisión bancaria', 'Examina tu extracto bancario del último mes.', 120, 5),
((SELECT id FROM missions WHERE name='Identifica fugas de dinero' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Marcar gastos innecesarios', 'Subraya todos los pagos poco útiles.', 180, 10),
((SELECT id FROM missions WHERE name='Identifica fugas de dinero' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Cálculo total', 'Suma cuánto gastaste en fugas.', 180, 10),
((SELECT id FROM missions WHERE name='Reto de 7 días sin gasto extra' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Define reglas', 'Decide qué gastos están prohibidos en el reto.', 120, 5),
((SELECT id FROM missions WHERE name='Reto de 7 días sin gasto extra' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Registro diario', 'Apunta cada día si cumpliste el reto.', 420, 10),
((SELECT id FROM missions WHERE name='Reto de 7 días sin gasto extra' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Evaluación final', 'Reflexiona sobre la experiencia.', 240, 10),
((SELECT id FROM missions WHERE name='El poder del ahorro automático' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Investiga opciones', 'Revisa cómo programar transferencias automáticas en tu banco.', 180, 10),
((SELECT id FROM missions WHERE name='El poder del ahorro automático' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Configura una prueba', 'Activa un ahorro automático pequeño.', 240, 10),
((SELECT id FROM missions WHERE name='El poder del ahorro automático' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Evalúa resultados', 'Revisa al final del mes el efecto.', 240, 10),
((SELECT id FROM missions WHERE name='Construye un hábito financiero' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Selecciona hábito', 'Elige un hábito sencillo (ej. anotar gastos).', 120, 5),
((SELECT id FROM missions WHERE name='Construye un hábito financiero' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Práctica continua', 'Mantén el hábito durante 21 días.', 420, 10),
((SELECT id FROM missions WHERE name='Construye un hábito financiero' AND campaign_id=(SELECT id FROM campaigns WHERE name='Hábitos de Consumo' AND pole_id=1)), 'Registro de progreso', 'Anota resultados y aprendizajes.', 240, 10);

-- REINO 5: Metas Financieras
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1), 'Define objetivos SMART', 'Aprende a establecer objetivos específicos, medibles, alcanzables, relevantes y con plazo.', 300, 10),
((SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1), 'Plazo corto vs largo plazo', 'Comprende la diferencia entre metas inmediatas y proyectos futuros.', 300, 10),
((SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1), 'Visualiza tu meta', 'Da forma a tus objetivos con imágenes y frases motivadoras.', 300, 10),
((SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1), 'Calcula cuánto ahorrar mensualmente', 'Aprende a dividir tu meta en pasos alcanzables.', 600, 20),
((SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1), 'Crea tu plan de metas', 'Construye un plan completo con prioridades y plazos.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='Define objetivos SMART' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Especificidad', 'Escribe una meta concreta y clara.', 120, 5),
((SELECT id FROM missions WHERE name='Define objetivos SMART' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Medible y alcanzable', 'Ponle un número o indicador que se pueda medir.', 120, 5),
((SELECT id FROM missions WHERE name='Define objetivos SMART' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Plazo temporal', 'Asigna un límite de tiempo a la meta.', 180, 10),
((SELECT id FROM missions WHERE name='Plazo corto vs largo plazo' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Lista de corto plazo', 'Haz una lista de metas inmediatas (menos de 1 año).', 120, 5),
((SELECT id FROM missions WHERE name='Plazo corto vs largo plazo' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Lista de largo plazo', 'Haz otra lista con metas mayores a 5 años.', 120, 5),
((SELECT id FROM missions WHERE name='Plazo corto vs largo plazo' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Clasificación', 'Ordena tus metas por horizonte temporal.', 180, 10),
((SELECT id FROM missions WHERE name='Visualiza tu meta' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Imagen representativa', 'Busca o dibuja una imagen que represente tu meta.', 180, 10),
((SELECT id FROM missions WHERE name='Visualiza tu meta' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Frase motivadora', 'Escribe una frase que te recuerde tu objetivo.', 120, 5),
((SELECT id FROM missions WHERE name='Visualiza tu meta' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Compartir', 'Comparte tu meta en la comunidad.', 240, 10),
((SELECT id FROM missions WHERE name='Calcula cuánto ahorrar mensualmente' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Divide meta total', 'Divide tu meta entre los meses disponibles.', 180, 10),
((SELECT id FROM missions WHERE name='Calcula cuánto ahorrar mensualmente' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Plan mensual', 'Define cuánto ahorrarás cada mes.', 180, 10),
((SELECT id FROM missions WHERE name='Calcula cuánto ahorrar mensualmente' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Simulación', 'Prueba escenarios de retrasos o adelantos.', 240, 10),
((SELECT id FROM missions WHERE name='Crea tu plan de metas' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Redacción de metas', 'Escribe todas tus metas en un documento.', 180, 10),
((SELECT id FROM missions WHERE name='Crea tu plan de metas' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Prioridades', 'Pon prioridades a tus objetivos.', 180, 10),
((SELECT id FROM missions WHERE name='Crea tu plan de metas' AND campaign_id=(SELECT id FROM campaigns WHERE name='Metas Financieras' AND pole_id=1)), 'Tablero visual', 'Crea un mural o tablero con tus metas.', 300, 15);

-- ================================
-- POLO 2: SUR – Inversión & Crecimiento
-- ================================
INSERT INTO campaigns (pole_id, name, description) VALUES
(2, 'El Interés Compuesto', 'Aprende cómo el interés compuesto multiplica tus ahorros.'),
(2, 'Acciones y Fondos', 'Introducción a la inversión en acciones, ETFs y fondos.'),
(2, 'Bonos y Renta Fija', 'Comprende el papel de la renta fija en una cartera.'),
(2, 'Inversión Inmobiliaria', 'Descubre cómo invertir en bienes raíces.'),
(2, 'Criptomonedas', 'Introducción al mundo de las criptomonedas y activos digitales.');

-- REINO 1: El Interés Compuesto
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2), 'Interés simple vs compuesto', 'Comprende la diferencia entre ambos.', 300, 10),
((SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2), 'Ejemplo básico', 'Calcula un ejemplo sencillo de interés compuesto.', 300, 10),
((SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2), 'Simulación a 10 años', 'Ve cómo crecen los ahorros a largo plazo.', 600, 20),
((SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2), 'Valor del tiempo', 'Descubre por qué empezar temprano importa.', 600, 20),
((SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2), 'Tu simulación personal', 'Haz un cálculo con tus propios datos.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='Interés simple vs compuesto' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Definición interés simple', 'Aprende cómo funciona el interés simple.', 120, 5),
((SELECT id FROM missions WHERE name='Interés simple vs compuesto' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Definición interés compuesto', 'Aprende cómo funciona el interés compuesto.', 120, 5),
((SELECT id FROM missions WHERE name='Interés simple vs compuesto' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Comparación práctica', 'Compara los resultados de ambos métodos.', 180, 10),
((SELECT id FROM missions WHERE name='Ejemplo básico' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Monto inicial', 'Elige una cantidad inicial para invertir.', 120, 5),
((SELECT id FROM missions WHERE name='Ejemplo básico' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Aplicar fórmula', 'Aplica la fórmula de interés compuesto.', 180, 10),
((SELECT id FROM missions WHERE name='Ejemplo básico' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Resultado', 'Analiza el resultado obtenido.', 120, 5),
((SELECT id FROM missions WHERE name='Simulación a 10 años' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Año 1-3', 'Calcula el crecimiento en los primeros 3 años.', 180, 10),
((SELECT id FROM missions WHERE name='Simulación a 10 años' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Año 4-7', 'Calcula el crecimiento de medio plazo.', 180, 10),
((SELECT id FROM missions WHERE name='Simulación a 10 años' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Año 8-10', 'Calcula el resultado final tras 10 años.', 240, 10),
((SELECT id FROM missions WHERE name='Valor del tiempo' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Inversor temprano', 'Simula alguien que invierte desde joven.', 180, 10),
((SELECT id FROM missions WHERE name='Valor del tiempo' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Inversor tardío', 'Simula alguien que empieza tarde.', 180, 10),
((SELECT id FROM missions WHERE name='Valor del tiempo' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Comparación', 'Compara ambos escenarios.', 240, 10),
((SELECT id FROM missions WHERE name='Tu simulación personal' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Datos iniciales', 'Introduce monto inicial y plazo.', 180, 10),
((SELECT id FROM missions WHERE name='Tu simulación personal' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Datos adicionales', 'Introduce tasa de interés y aportes periódicos.', 240, 10),
((SELECT id FROM missions WHERE name='Tu simulación personal' AND campaign_id=(SELECT id FROM campaigns WHERE name='El Interés Compuesto' AND pole_id=2)), 'Resultado final', 'Analiza cuánto habrías acumulado.', 300, 15);

-- REINO 2: Acciones y Fondos
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2), '¿Qué es una acción?', 'Comprende el concepto de participación en una empresa.', 300, 10),
((SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2), 'ETF vs Fondo Mutuo', 'Conoce las diferencias entre fondos cotizados y fondos tradicionales.', 300, 10),
((SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2), 'Simula una compra', 'Ejercicio práctico de cómo sería invertir en acciones.', 600, 20),
((SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2), 'Riesgo y diversificación', 'Aprende la importancia de repartir riesgos en tu portafolio.', 600, 20),
((SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2), 'Crea tu primera cartera virtual', 'Diseña una cartera de inversión simulada.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='¿Qué es una acción?' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Definición', 'Lee qué significa tener una acción.', 120, 5),
((SELECT id FROM missions WHERE name='¿Qué es una acción?' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Ejemplo práctico', 'Ejemplo de acción: comprar una participación en Apple.', 120, 5),
((SELECT id FROM missions WHERE name='¿Qué es una acción?' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Reflexión', 'Piensa por qué las empresas emiten acciones.', 180, 10),
((SELECT id FROM missions WHERE name='ETF vs Fondo Mutuo' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Definición ETF', 'Aprende qué es un Exchange Traded Fund.', 120, 5),
((SELECT id FROM missions WHERE name='ETF vs Fondo Mutuo' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Definición Fondo Mutuo', 'Aprende qué es un fondo de inversión tradicional.', 120, 5),
((SELECT id FROM missions WHERE name='ETF vs Fondo Mutuo' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Comparación', 'Identifica las principales diferencias entre ambos.', 180, 10),
((SELECT id FROM missions WHERE name='Simula una compra' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Selecciona acción', 'Elige una acción de ejemplo para invertir.', 120, 5),
((SELECT id FROM missions WHERE name='Simula una compra' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Precio y cantidad', 'Define precio y cantidad a comprar.', 180, 10),
((SELECT id FROM missions WHERE name='Simula una compra' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Resultado', 'Analiza cuánto habrías invertido.', 240, 10),
((SELECT id FROM missions WHERE name='Riesgo y diversificación' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Diversificación básica', 'Reparte tu inversión entre varios activos.', 180, 10),
((SELECT id FROM missions WHERE name='Riesgo y diversificación' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Ejemplo de cartera', 'Analiza una cartera diversificada.', 240, 10),
((SELECT id FROM missions WHERE name='Riesgo y diversificación' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Reflexión', 'Reflexiona sobre los beneficios de diversificar.', 180, 10),
((SELECT id FROM missions WHERE name='Crea tu primera cartera virtual' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Definir activos', 'Elige qué activos incluirías en tu cartera.', 180, 10),
((SELECT id FROM missions WHERE name='Crea tu primera cartera virtual' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Asignar proporciones', 'Decide cuánto porcentaje dar a cada activo.', 240, 10),
((SELECT id FROM missions WHERE name='Crea tu primera cartera virtual' AND campaign_id=(SELECT id FROM campaigns WHERE name='Acciones y Fondos' AND pole_id=2)), 'Evaluación', 'Evalúa si tu cartera está equilibrada.', 300, 15);

-- REINO 3: Bonos y Renta Fija
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2), '¿Qué es un bono?', 'Aprende qué son los bonos y su función.', 300, 10),
((SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2), 'Cupón y vencimiento', 'Descubre cómo funcionan estos elementos clave en los bonos.', 300, 10),
((SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2), 'Bonos vs Acciones', 'Compara las diferencias entre renta fija y renta variable.', 600, 20),
((SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2), 'Tipos de bonos', 'Distingue entre bonos gubernamentales y corporativos.', 600, 20),
((SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2), 'Dónde encajan en la cartera', 'Comprende cómo equilibran el riesgo de inversión.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='¿Qué es un bono?' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Definición', 'Lee qué significa un bono financiero.', 120, 5),
((SELECT id FROM missions WHERE name='¿Qué es un bono?' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Ejemplo', 'Analiza un ejemplo de bono del Estado.', 120, 5),
((SELECT id FROM missions WHERE name='¿Qué es un bono?' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Reflexión', 'Piensa por qué los bonos se consideran más seguros.', 180, 10),
((SELECT id FROM missions WHERE name='Cupón y vencimiento' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Cupón', 'Aprende qué es el cupón de un bono.', 120, 5),
((SELECT id FROM missions WHERE name='Cupón y vencimiento' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Vencimiento', 'Comprende qué significa la fecha de vencimiento.', 120, 5),
((SELECT id FROM missions WHERE name='Cupón y vencimiento' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Ejemplo práctico', 'Ejemplo de bono con cupón fijo.', 180, 10),
((SELECT id FROM missions WHERE name='Bonos vs Acciones' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Comparación', 'Diferencias entre invertir en bonos y en acciones.', 180, 10),
((SELECT id FROM missions WHERE name='Bonos vs Acciones' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Ventajas bonos', 'Por qué los bonos son más estables.', 180, 10),
((SELECT id FROM missions WHERE name='Bonos vs Acciones' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Ventajas acciones', 'Por qué las acciones tienen más potencial de crecimiento.', 240, 10),
((SELECT id FROM missions WHERE name='Tipos de bonos' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Gubernamentales', 'Conoce los bonos emitidos por gobiernos.', 180, 10),
((SELECT id FROM missions WHERE name='Tipos de bonos' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Corporativos', 'Aprende sobre los bonos emitidos por empresas.', 180, 10),
((SELECT id FROM missions WHERE name='Tipos de bonos' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Comparación', 'Compara riesgos y rendimientos de ambos tipos.', 240, 10),
((SELECT id FROM missions WHERE name='Dónde encajan en la cartera' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Diversificación', 'Aprende cómo los bonos reducen el riesgo global.', 180, 10),
((SELECT id FROM missions WHERE name='Dónde encajan en la cartera' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Ejemplo práctico', 'Ejemplo de cartera con bonos y acciones.', 240, 10),
((SELECT id FROM missions WHERE name='Dónde encajan en la cartera' AND campaign_id=(SELECT id FROM campaigns WHERE name='Bonos y Renta Fija' AND pole_id=2)), 'Reflexión', 'Reflexiona por qué incluir bonos en tu estrategia.', 300, 15);

-- REINO 4: Inversión Inmobiliaria
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2), 'Compra vs alquiler', 'Analiza ventajas y desventajas de comprar o alquilar.', 300, 10),
((SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2), 'Flujo de caja positivo', 'Aprende cómo generar ingresos constantes con inmuebles.', 300, 10),
((SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2), 'Hipotecas y apalancamiento', 'Comprende cómo usar deuda para invertir en bienes raíces.', 600, 20),
((SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2), 'Riesgos inmobiliarios', 'Conoce los principales riesgos del sector inmobiliario.', 600, 20),
((SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2), 'Caso práctico de inversión', 'Simula una inversión inmobiliaria completa.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='Compra vs alquiler' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Ventajas de comprar', 'Analiza beneficios como patrimonio y plusvalía.', 120, 5),
((SELECT id FROM missions WHERE name='Compra vs alquiler' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Ventajas de alquilar', 'Analiza beneficios como flexibilidad y liquidez.', 120, 5),
((SELECT id FROM missions WHERE name='Compra vs alquiler' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Comparación final', 'Reflexiona qué opción se adapta mejor a ti.', 180, 10),
((SELECT id FROM missions WHERE name='Flujo de caja positivo' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Ingresos brutos', 'Calcula el ingreso esperado de un alquiler.', 120, 5),
((SELECT id FROM missions WHERE name='Flujo de caja positivo' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Gastos asociados', 'Incluye impuestos, mantenimiento y seguros.', 180, 10),
((SELECT id FROM missions WHERE name='Flujo de caja positivo' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Resultado neto', 'Resta gastos a ingresos para ver si es positivo.', 240, 10),
((SELECT id FROM missions WHERE name='Hipotecas y apalancamiento' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Qué es una hipoteca', 'Aprende cómo funciona un préstamo hipotecario.', 120, 5),
((SELECT id FROM missions WHERE name='Hipotecas y apalancamiento' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Apalancamiento', 'Entiende cómo usar deuda para invertir más.', 180, 10),
((SELECT id FROM missions WHERE name='Hipotecas y apalancamiento' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Ejemplo práctico', 'Simula una inversión con hipoteca.', 240, 10),
((SELECT id FROM missions WHERE name='Riesgos inmobiliarios' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Riesgo de vacancia', 'Considera la posibilidad de meses sin inquilino.', 120, 5),
((SELECT id FROM missions WHERE name='Riesgos inmobiliarios' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Riesgo de mercado', 'Reflexiona sobre caídas de precios inmobiliarios.', 180, 10),
((SELECT id FROM missions WHERE name='Riesgos inmobiliarios' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Riesgos legales', 'Aprende sobre problemas legales y normativos.', 240, 10),
((SELECT id FROM missions WHERE name='Caso práctico de inversión' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Definir inmueble', 'Selecciona un ejemplo de propiedad.', 180, 10),
((SELECT id FROM missions WHERE name='Caso práctico de inversión' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Hacer números', 'Calcula ingresos y gastos simulados.', 240, 10),
((SELECT id FROM missions WHERE name='Caso práctico de inversión' AND campaign_id=(SELECT id FROM campaigns WHERE name='Inversión Inmobiliaria' AND pole_id=2)), 'Conclusión', 'Decide si la inversión sería rentable.', 300, 15);

-- REINO 5: Criptomonedas
INSERT INTO missions (campaign_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2), '¿Qué es Bitcoin?', 'Aprende qué es Bitcoin y por qué fue la primera criptomoneda.', 300, 10),
((SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2), 'Wallets y Exchanges', 'Descubre cómo guardar y usar criptomonedas.', 300, 10),
((SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2), 'Riesgos de volatilidad', 'Comprende la volatilidad y los riesgos del mercado cripto.', 600, 20),
((SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2), 'Stablecoins y su utilidad', 'Conoce qué son las stablecoins y cómo funcionan.', 600, 20),
((SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2), 'Estrategia DCA en cripto', 'Aprende a invertir poco a poco de forma sistemática.', 900, 30);

INSERT INTO submissions (mission_id, name, description, duration_sec, reward_xp) VALUES
((SELECT id FROM missions WHERE name='¿Qué es Bitcoin?' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Historia', 'Lee sobre el origen de Bitcoin en 2009.', 120, 5),
((SELECT id FROM missions WHERE name='¿Qué es Bitcoin?' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Características', 'Analiza qué lo diferencia del dinero tradicional.', 180, 10),
((SELECT id FROM missions WHERE name='¿Qué es Bitcoin?' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Reflexión', 'Piensa en por qué Bitcoin puede tener valor.', 180, 10),
((SELECT id FROM missions WHERE name='Wallets y Exchanges' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Tipos de wallets', 'Aprende la diferencia entre hot y cold wallets.', 120, 5),
((SELECT id FROM missions WHERE name='Wallets y Exchanges' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Custodia propia vs exchange', 'Reflexiona sobre quién controla tus fondos.', 180, 10),
((SELECT id FROM missions WHERE name='Wallets y Exchanges' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Ejemplo práctico', 'Simula abrir una wallet gratuita.', 240, 10),
((SELECT id FROM missions WHERE name='Riesgos de volatilidad' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Ejemplo de volatilidad', 'Analiza un gráfico con subidas y bajadas rápidas.', 180, 10),
((SELECT id FROM missions WHERE name='Riesgos de volatilidad' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Riesgo de pérdida', 'Reflexiona sobre cuánto estarías dispuesto a perder.', 240, 10),
((SELECT id FROM missions WHERE name='Riesgos de volatilidad' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Gestión emocional', 'Aprende a controlar emociones en mercados volátiles.', 240, 10),
((SELECT id FROM missions WHERE name='Stablecoins y su utilidad' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Definición', 'Aprende qué son las stablecoins.', 120, 5),
((SELECT id FROM missions WHERE name='Stablecoins y su utilidad' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Ejemplos', 'Conoce USDT, USDC, DAI y sus diferencias.', 180, 10),
((SELECT id FROM missions WHERE name='Stablecoins y su utilidad' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Usos prácticos', 'Aprende cómo se usan para pagos y ahorro.', 240, 10),
((SELECT id FROM missions WHERE name='Estrategia DCA en cripto' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Qué es DCA', 'Aprende el concepto de Dollar Cost Averaging.', 120, 5),
((SELECT id FROM missions WHERE name='Estrategia DCA en cripto' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Simulación práctica', 'Ejemplo de invertir 50€/mes en Bitcoin.', 240, 10),
((SELECT id FROM missions WHERE name='Estrategia DCA en cripto' AND campaign_id=(SELECT id FROM campaigns WHERE name='Criptomonedas' AND pole_id=2)), 'Ventajas', 'Reflexiona sobre las ventajas de esta estrategia.', 300, 15);

-- ================================
-- POLO 3: ESTE – Innovación & Riesgo Calculado
-- (Solo campañas en MVP — misiones próximamente)
-- ================================
INSERT INTO campaigns (pole_id, name, description) VALUES
(3, 'Introducción al Trading', 'Conceptos base del trading y análisis de mercados.'),
(3, 'Análisis Técnico', 'Aprende a leer gráficos y usar indicadores.'),
(3, 'Trading con Bots', 'Automatiza estrategias con bots de trading.'),
(3, 'DeFi y Web3', 'Protocolos descentralizados y finanzas del futuro.'),
(3, 'Gestión del Riesgo', 'Controla pérdidas y optimiza tu capital.');

-- ================================
-- POLO 4: OESTE – Seguridad & Preservación
-- (Solo campañas en MVP — misiones próximamente)
-- ================================
INSERT INTO campaigns (pole_id, name, description) VALUES
(4, 'Seguros y Protección', 'Aprende a proteger tu patrimonio con seguros adecuados.'),
(4, 'Planificación Patrimonial', 'Gestiona y preserva tu patrimonio a largo plazo.'),
(4, 'Fondos de Pensiones', 'Entiende cómo funciona el sistema de pensiones y cómo complementarlo.'),
(4, 'Diversificación Defensiva', 'Estrategias para reducir riesgos en épocas de incertidumbre.'),
(4, 'Herencias y Fiscalidad', 'Planifica la transmisión de patrimonio de forma eficiente.');
