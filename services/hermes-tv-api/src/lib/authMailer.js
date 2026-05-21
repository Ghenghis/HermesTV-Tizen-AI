'use strict';

/**
 * Minimal SMTP sender for DaveTV account links.
 *
 * No fake email path: when SMTP is not configured, callers receive
 * { sent:false, reason:'smtp_not_configured' } and the admin UI shows the
 * link to Dave directly. When SMTP env vars are present this sends a real
 * RFC 5321 message over SSL (465) or STARTTLS (587/default).
 */

const net = require('net');
const tls = require('tls');

function isConfigured() {
  return !!(process.env.DAVETV_SMTP_HOST && process.env.DAVETV_SMTP_FROM);
}

function readMultiline(socket) {
  return new Promise(function(resolve, reject) {
    let data = '';
    function onData(chunk) {
      data += chunk.toString('utf8');
      const lines = data.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return;
      const last = lines[lines.length - 1];
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: Number(last.slice(0, 3)), text: data });
      }
    }
    function onError(err) {
      cleanup();
      reject(err);
    }
    function cleanup() {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
    }
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

function writeCommand(socket, command, expect) {
  socket.write(command + '\r\n');
  return readMultiline(socket).then(function(reply) {
    const expected = Array.isArray(expect) ? expect : [expect];
    if (expected.indexOf(reply.code) === -1) {
      const err = new Error('SMTP command failed with ' + reply.code);
      err.smtp_code = reply.code;
      throw err;
    }
    return reply;
  });
}

function dotStuff(text) {
  return String(text || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function connect() {
  const host = process.env.DAVETV_SMTP_HOST;
  const port = Number(process.env.DAVETV_SMTP_PORT || 587);
  const secure = String(process.env.DAVETV_SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  return new Promise(function(resolve, reject) {
    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    socket.setTimeout(15000);
    socket.once('error', reject);
    socket.once('timeout', function() {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    });
    socket.once('connect', function() {
      readMultiline(socket).then(function(reply) {
        if (reply.code !== 220) throw new Error('SMTP greeting failed with ' + reply.code);
        resolve({ socket, secure });
      }).catch(reject);
    });
  });
}

async function upgradeStartTls(socket, host) {
  await writeCommand(socket, 'STARTTLS', 220);
  return tls.connect({ socket, servername: host });
}

function message(from, to, subject, bodyText) {
  const safeSubject = String(subject || 'DaveTV account link').replace(/\r|\n/g, ' ');
  return [
    'From: ' + from,
    'To: ' + to,
    'Subject: ' + safeSubject,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    bodyText,
  ].join('\r\n');
}

async function sendMail(to, subject, bodyText) {
  if (!isConfigured()) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const host = process.env.DAVETV_SMTP_HOST;
  const from = process.env.DAVETV_SMTP_FROM;
  const user = process.env.DAVETV_SMTP_USER || '';
  const pass = process.env.DAVETV_SMTP_PASS || '';
  let conn = await connect();
  let socket = conn.socket;
  try {
    await writeCommand(socket, 'EHLO davetv.local', 250);
    if (!conn.secure && String(process.env.DAVETV_SMTP_STARTTLS || 'true').toLowerCase() !== 'false') {
      socket = await upgradeStartTls(socket, host);
      await writeCommand(socket, 'EHLO davetv.local', 250);
    }
    if (user && pass) {
      const auth = Buffer.from('\u0000' + user + '\u0000' + pass, 'utf8').toString('base64');
      await writeCommand(socket, 'AUTH PLAIN ' + auth, 235);
    }
    await writeCommand(socket, 'MAIL FROM:<' + from + '>', 250);
    await writeCommand(socket, 'RCPT TO:<' + to + '>', [250, 251]);
    await writeCommand(socket, 'DATA', 354);
    socket.write(dotStuff(message(from, to, subject, bodyText)) + '\r\n.\r\n');
    const finalReply = await readMultiline(socket);
    if (finalReply.code !== 250) {
      throw new Error('SMTP DATA failed with ' + finalReply.code);
    }
    try { await writeCommand(socket, 'QUIT', 221); } catch (_) { /* ignore */ }
    return { sent: true };
  } finally {
    try { socket.end(); } catch (_) { /* ignore */ }
  }
}

function sendInvite(to, link, displayName, expiresAt) {
  return sendMail(
    to,
    'Your DaveTV account invite',
    [
      'Hi ' + displayName + ',',
      '',
      'Dave created a DaveTV account invite for you.',
      '',
      'Register here:',
      link,
      '',
      'This invite expires at ' + expiresAt + '.',
      '',
      'If you were not expecting this, ignore this email.',
    ].join('\n')
  );
}

function sendReset(to, link) {
  return sendMail(
    to,
    'Reset your DaveTV password',
    [
      'A DaveTV password reset was requested for this email.',
      '',
      'Reset here:',
      link,
      '',
      'This link expires in 2 hours.',
      '',
      'If you did not request this, ignore this email.',
    ].join('\n')
  );
}

module.exports = {
  isConfigured,
  sendMail,
  sendInvite,
  sendReset,
};
