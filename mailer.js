const nodemailer = require('nodemailer');

let transporter = null;

// Usar nombres únicos para evitar conflictos con Hostinger
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_MAIL_PORT || '587'),
      secure: (process.env.SMTP_MAIL_PORT || '587') === '465',
      auth: {
        user: process.env.SMTP_MAIL_USER,
        pass: process.env.SMTP_MAIL_PASS,
      },
    });
  }
  return transporter;
}

async function enviarCorreo(destinatario, asunto, htmlBody) {
  if (!process.env.SMTP_MAIL_USER) {
    console.log('SMTP no configurado — correo no enviado a:', destinatario);
    return null;
  }
  const transport = getTransporter();
  const info = await transport.sendMail({
    from: process.env.SMTP_MAIL_FROM || process.env.SMTP_MAIL_USER,
    to: destinatario,
    subject: asunto,
    html: wrapTemplate(htmlBody),
  });
  return info;
}

function wrapTemplate(contenido) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#0B3B3C;padding:24px 32px;border-radius:16px 16px 0 0;text-align:center;">
      <h2 style="color:#fff;margin:0;font-size:20px;">Dra. Samantha Andrade</h2>
      <p style="color:#C8A96E;margin:4px 0 0;font-size:13px;">Oftalmología Especializada · San Pedro Garza García</p>
    </div>
    <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;border:1px solid #E8E4DD;border-top:none;">
      ${contenido}
    </div>
    <p style="text-align:center;color:#A09A90;font-size:12px;margin-top:20px;">
      Río de la Plata 100 Ote., San Pedro Garza García, N.L.<br>
      Este correo fue enviado desde el consultorio de la Dra. Samantha Andrade.
    </p>
  </div>
</body>
</html>`;
}

function templateConfirmacion(nombre, fecha, horario) {
  return `
    <h3 style="color:#0B3B3C;margin:0 0 16px;">¡Hola ${nombre}!</h3>
    <p style="color:#6B6560;line-height:1.7;">
      Hemos recibido tu cuestionario pre-consulta. Tu información ya está en nuestro sistema
      y la Dra. Samantha la revisará antes de tu cita.
    </p>
    ${fecha ? `<p style="color:#6B6560;line-height:1.7;"><strong>Fecha solicitada:</strong> ${fecha}<br><strong>Horario preferido:</strong> ${horario || 'Por confirmar'}</p>` : ''}
    <p style="color:#6B6560;line-height:1.7;">
      Nos pondremos en contacto contigo pronto para confirmar tu cita.
    </p>
    <div style="background:#FFF8EE;border-left:4px solid #C8A96E;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
      <strong style="color:#0B3B3C;">Recordatorio importante</strong>
      <p style="color:#6B6560;margin:8px 0 0;font-size:14px;">
        Si usas lentes de contacto, recuerda dejar de utilizarlos al menos <strong>24 horas antes</strong>
        de tu consulta para obtener resultados precisos en tu evaluación.
      </p>
    </div>
    <p style="color:#A09A90;font-size:13px;">— Consultorio Dra. Samantha Andrade</p>`;
}

function templateRecordatorio(nombre, fecha) {
  return `
    <h3 style="color:#0B3B3C;margin:0 0 16px;">Recordatorio de cita</h3>
    <p style="color:#6B6560;line-height:1.7;">
      Hola ${nombre}, te recordamos que tienes una cita programada${fecha ? ` para el <strong>${fecha}</strong>` : ''}.
    </p>
    <div style="background:#FFF8EE;border-left:4px solid #C8A96E;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
      <strong style="color:#0B3B3C;">Antes de tu visita</strong>
      <p style="color:#6B6560;margin:8px 0 0;font-size:14px;">
        Si usas lentes de contacto, <strong>deja de usarlos al menos 24 horas antes</strong> de tu cita.
        Esto es fundamental para que los resultados de tu evaluación sean precisos.
      </p>
    </div>
    <p style="color:#6B6560;line-height:1.7;">Te esperamos en nuestro consultorio.</p>
    <p style="color:#A09A90;font-size:13px;">— Consultorio Dra. Samantha Andrade</p>`;
}

module.exports = { enviarCorreo, templateConfirmacion, templateRecordatorio };
