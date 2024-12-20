const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const net = require('net');
const winston = require('winston');
const fs = require('fs');

// Membuat format log khusus untuk Winston
const logFormat = winston.format.printf(
  ({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`
);

// Membuat instance logger Winston dengan level trace
const logger = winston.createLogger({
  level: 'info', // Set level log ke 'info'
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
    trace: 7 // Menambahkan level trace
  },
  format: winston.format.combine(
    winston.format.timestamp(), // Menambahkan timestamp pada log
    logFormat // Menggunakan logFormat yang telah didefinisikan
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), logFormat) }),
    new winston.transports.File({ filename: './logs.log' })
  ]
});

// Fungsi untuk memulai bot
const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: logger, // Gunakan logger Winston
    });

    // Event: Update koneksi
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        logger.info('Update koneksi:', update);

        if (connection === 'close') {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            logger.info('Koneksi terputus. Reconnect:', shouldReconnect);

            if (shouldReconnect) {
                startBot(); // Reconnect
            } else {
                logger.info('Logout. Scan QR ulang.');
            }
        } else if (connection === 'open') {
            logger.info('Bot terhubung ke WhatsApp!');
        }
    });

    // Event: Update kredensial
    sock.ev.on('creds.update', saveCreds);

    // Mulai server TCP untuk menerima data dari plugin Minecraft
    startTcpServer(sock);
};

// Fungsi untuk memulai server TCP
const startTcpServer = (sock) => {
    const host = '127.0.0.1'; // Ganti dengan host Anda
    const port = 3000; // Ganti dengan port Anda

    const server = net.createServer((socket) => {
        logger.info('Client terhubung ke server TCP');

        // Atur timeout untuk koneksi (contoh: 60 detik)
        socket.setTimeout(60000); // Timeout dalam milidetik (60 detik)
        socket.on('timeout', () => {
            logger.warn('Koneksi timeout, menutup koneksi.');
            socket.end(); // Menutup koneksi saat timeout
        });

        // Event: Data diterima dari plugin Minecraft
        socket.on('data', (data) => {
            const dataStr = data.toString();
            logger.info('Data diterima:', dataStr);

            // Log tambahan untuk memastikan data yang diterima
            logger.debug(`Raw data: ${dataStr}`);

            // Cek jika data adalah JSON yang valid
            let parsedData;
            try {
                parsedData = JSON.parse(dataStr);
                logger.info('Data setelah di-parse:', parsedData);
            } catch (e) {
                logger.error('Error parsing JSON:', e);
                return; // Hentikan eksekusi jika tidak valid
            }

            const { type, player, message } = parsedData;
            if (!type || !player || !message) {
                logger.warn('Data tidak lengkap:', parsedData);
                return;
            }

            // Kirim pesan ke WhatsApp
            if (type === 'chat') {
                sendMessage(sock, `*[Chat]*\n*${player}*: ${message}`);
            } else if (type === 'join') {
                sendMessage(sock, `*[Join]*\n*${player}* telah bergabung ke server!`);
            } else if (type === 'leave') {
                sendMessage(sock, `*[Leave]*\n*${player}* telah keluar dari server.`);
            }
        });

        // Event: Koneksi ditutup
        socket.on('end', () => {
            logger.info('Client terputus');
        });

        // Event: Error pada koneksi
        socket.on('error', (err) => {
            logger.error('Error pada koneksi:', err.message);
        });

        // Kirim pesan sambutan ke client
        socket.write('Bot Minecraft siap menerima data!');
    });

    // Server mulai mendengarkan koneksi pada host dan port
    server.listen(port, host, () => {
        logger.info(`Server TCP berjalan di ${host}:${port}`);
    });
};

// Fungsi untuk mengirim pesan ke grup WhatsApp
const sendMessage = (sock, message) => {
    const groupId = '120363340691143291@g.us'; // Ganti dengan ID grup WhatsApp Anda
    sock.sendMessage(groupId, { text: message })
        .then(() => logger.info(`Pesan terkirim: ${message}`))
        .catch((err) => logger.error('Gagal mengirim pesan:', err));
};

startBot();