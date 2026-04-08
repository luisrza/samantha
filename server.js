const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ─── Config con fallbacks hardcodeados ───
const CONFIG = {
  PORT: process.env.PORT || 6969,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'samantha2026',
};
console.log('CONFIG loaded — ADMIN_PASSWORD set:', CONFIG.ADMIN_PASSWORD ? 'YES' : 'NO');
console.log('DATABASE_URL set:', process.env.DATABASE_URL ? 'YES' : 'NO');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { enviarCorreo, templateConfirmacion, templateRecordatorio } = require('./mailer');

const app = express();
const PORT = CONFIG.PORT;

// ─── Seguridad ───
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '50kb' }));

// Rate limit para el cuestionario (max 10 por IP cada 15 min)
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas solicitudes, intenta más tarde.' },
});

// Servir archivos estáticos SOLO desde /public
app.use(express.static(path.join(__dirname, 'public')));

// ─── Middleware auth para rutas admin ───
function authAdmin(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== CONFIG.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ─── POST /api/cuestionario ─── Recibe el formulario del frontend
app.post('/api/cuestionario', formLimiter, async (req, res) => {
  try {
    const { paciente, cuestionario } = req.body;

    if (!paciente || !paciente.nombre) {
      return res.status(400).json({ error: 'Nombre es requerido' });
    }

    const nuevoPaciente = await db.crearPaciente({
      nombre: paciente.nombre,
      edad: paciente.edad,
      telefono: paciente.telefono,
      email: paciente.email,
      primera_consulta: paciente.primera_consulta,
    });

    const nuevoCuestionario = await db.crearCuestionario(nuevoPaciente.id, cuestionario);

    // Enviar correo de confirmación si hay email
    if (paciente.email) {
      try {
        const html = templateConfirmacion(
          paciente.nombre,
          cuestionario.fecha_preferida,
          cuestionario.horario_preferido
        );
        await enviarCorreo(paciente.email, 'Recibimos tu cuestionario — Dra. Samantha Andrade', html);
        await db.guardarCorreoEnviado(nuevoPaciente.id, 'Confirmación de cuestionario', html);
      } catch (emailErr) {
        console.error('Error enviando correo de confirmación:', emailErr.message);
      }
    }

    res.json({
      ok: true,
      paciente_id: nuevoPaciente.id,
      usa_lentes: cuestionario.usa_lentes,
    });
  } catch (err) {
    console.error('Error guardando cuestionario:', err);
    res.status(500).json({ error: 'Error al guardar los datos' });
  }
});

// ─── GET /api/pacientes ─── Lista de pacientes (admin)
app.get('/api/pacientes', authAdmin, async (req, res) => {
  try {
    const pacientes = await db.obtenerPacientes();
    res.json(pacientes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pacientes' });
  }
});

// ─── GET /api/pacientes/:id ─── Detalle de paciente (admin)
app.get('/api/pacientes/:id', authAdmin, async (req, res) => {
  try {
    const paciente = await db.obtenerPaciente(req.params.id);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(paciente);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener paciente' });
  }
});

// ─── POST /api/correos/enviar ─── Enviar correo a paciente (admin)
app.post('/api/correos/enviar', authAdmin, async (req, res) => {
  try {
    const { paciente_id, asunto, cuerpo, tipo } = req.body;
    const paciente = await db.obtenerPaciente(paciente_id);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });
    if (!paciente.email) return res.status(400).json({ error: 'El paciente no tiene correo registrado' });

    let htmlBody;
    if (tipo === 'recordatorio') {
      htmlBody = templateRecordatorio(paciente.nombre, paciente.cuestionario?.fecha_preferida);
    } else {
      htmlBody = `
        <h3 style="color:#0B3B3C;margin:0 0 16px;">Hola ${paciente.nombre},</h3>
        <div style="color:#6B6560;line-height:1.7;">${cuerpo}</div>
        <p style="color:#A09A90;font-size:13px;margin-top:24px;">— Consultorio Dra. Samantha Andrade</p>
      `;
    }

    await enviarCorreo(paciente.email, asunto, htmlBody);
    await db.guardarCorreoEnviado(paciente_id, asunto, htmlBody);

    res.json({ ok: true, mensaje: 'Correo enviado exitosamente' });
  } catch (err) {
    console.error('Error enviando correo:', err);
    res.status(500).json({ error: 'Error al enviar el correo: ' + err.message });
  }
});

// ─── GET /api/correos/:pacienteId ─── Historial de correos (admin)
app.get('/api/correos/:pacienteId', authAdmin, async (req, res) => {
  try {
    const paciente = await db.obtenerPaciente(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(paciente.correos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener correos' });
  }
});

// ─── Servir admin.html ───
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Error handler global ───
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── Iniciar ───
async function start() {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Panel admin en http://localhost:${PORT}/admin`);
  });

  try {
    await db.initDB();
  } catch (err) {
    console.error('Error conectando a la base de datos:', err.message);
    console.error('El servidor está corriendo pero sin conexión a la DB.');
  }
}

start();
