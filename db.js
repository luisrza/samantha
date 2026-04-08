const { Pool } = require('pg');

// Usar SUPABASE_URL (no DATABASE_URL — Hostinger lo pisa con su propia DB)
const DB_URL = process.env.SUPABASE_URL;
if (!DB_URL) {
  console.error('ERROR: Variable de entorno SUPABASE_URL no está configurada');
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en conexión idle:', err.message);
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pacientes (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        edad INTEGER,
        telefono VARCHAR(20),
        email VARCHAR(200),
        primera_consulta BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cuestionarios (
        id SERIAL PRIMARY KEY,
        paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
        motivo VARCHAR(100),
        sintomas JSONB DEFAULT '[]',
        desde_cuando VARCHAR(50),
        usa_lentes VARCHAR(20),
        condiciones_medicas JSONB DEFAULT '[]',
        antecedentes_familiares VARCHAR(100),
        medicamentos TEXT,
        horas_pantalla VARCHAR(20),
        deporte VARCHAR(20),
        ocupacion VARCHAR(200),
        notas TEXT,
        horario_preferido VARCHAR(20),
        fecha_preferida DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS correos_enviados (
        id SERIAL PRIMARY KEY,
        paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
        asunto VARCHAR(500),
        cuerpo TEXT,
        enviado_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Base de datos inicializada correctamente');
  } finally {
    client.release();
  }
}

async function crearPaciente({ nombre, edad, telefono, email, primera_consulta }) {
  const res = await pool.query(
    `INSERT INTO pacientes (nombre, edad, telefono, email, primera_consulta)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nombre, edad, telefono, email, primera_consulta]
  );
  return res.rows[0];
}

async function crearCuestionario(pacienteId, data) {
  const res = await pool.query(
    `INSERT INTO cuestionarios
     (paciente_id, motivo, sintomas, desde_cuando, usa_lentes, condiciones_medicas,
      antecedentes_familiares, medicamentos, horas_pantalla, deporte, ocupacion, notas,
      horario_preferido, fecha_preferida)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      pacienteId, data.motivo, JSON.stringify(data.sintomas || []),
      data.desde_cuando, data.usa_lentes, JSON.stringify(data.condiciones_medicas || []),
      data.antecedentes_familiares, data.medicamentos, data.horas_pantalla,
      data.deporte, data.ocupacion, data.notas,
      data.horario_preferido, data.fecha_preferida || null
    ]
  );
  return res.rows[0];
}

async function obtenerPacientes() {
  const res = await pool.query(`
    SELECT p.*, c.motivo, c.fecha_preferida, c.horario_preferido, c.created_at as cuestionario_fecha
    FROM pacientes p
    LEFT JOIN cuestionarios c ON c.paciente_id = p.id
    ORDER BY p.created_at DESC
  `);
  return res.rows;
}

async function obtenerPaciente(id) {
  const client = await pool.connect();
  try {
    const paciente = await client.query('SELECT * FROM pacientes WHERE id = $1', [id]);
    if (paciente.rows.length === 0) return null;

    const cuestionario = await client.query(
      'SELECT * FROM cuestionarios WHERE paciente_id = $1 ORDER BY created_at DESC LIMIT 1', [id]
    );
    const correos = await client.query(
      'SELECT * FROM correos_enviados WHERE paciente_id = $1 ORDER BY enviado_at DESC', [id]
    );

    return {
      ...paciente.rows[0],
      cuestionario: cuestionario.rows[0] || null,
      correos: correos.rows
    };
  } finally {
    client.release();
  }
}

async function guardarCorreoEnviado(pacienteId, asunto, cuerpo) {
  const res = await pool.query(
    `INSERT INTO correos_enviados (paciente_id, asunto, cuerpo) VALUES ($1, $2, $3) RETURNING *`,
    [pacienteId, asunto, cuerpo]
  );
  return res.rows[0];
}

module.exports = {
  pool, initDB, crearPaciente, crearCuestionario,
  obtenerPacientes, obtenerPaciente, guardarCorreoEnviado
};
