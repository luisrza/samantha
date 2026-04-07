require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { enviarCorreo, templateConfirmacion, templateRecordatorio } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Middleware auth para rutas admin ───
function authAdmin(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ─── POST /api/cuestionario ─── Recibe el formulario del frontend
app.post('/api/cuestionario', async (req, res) => {
  try {
    const { paciente, cuestionario } = req.body;

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
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ─── Iniciar ───
async function start() {
  try {
    await db.initDB();
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
      console.log(`Panel admin en http://localhost:${PORT}/admin`);
    });
  } catch (err) {
    console.error('Error iniciando servidor:', err);
    process.exit(1);
  }
}

start();
