const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');
const yaml = require('js-yaml'); // Modul untuk menulis file YML

// Fungsi utama untuk menjalankan bot
const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('Bot terhubung ke WhatsApp!');
            getGroups(sock);
        }
    });
};

// Fungsi untuk mengambil semua grup dan menyimpannya dalam file YML
const getGroups = async (sock) => {
    try {
        const groups = await sock.groupFetchAllParticipating();
        console.log('Daftar Grup:');

        const groupList = [];

        for (const groupId in groups) {
            const group = groups[groupId];
            console.log(`Nama Grup: ${group.subject} | ID Grup: ${group.id}`);

            // Menyusun data grup untuk disimpan
            groupList.push({
                nama: group.subject,
                id: group.id,
            });
        }

        // Menulis data grup ke file YML
        const yamlData = yaml.dump({ groups: groupList });
        fs.writeFileSync('idgrup.yml', yamlData, 'utf8');

        console.log('Daftar grup telah disimpan ke file idgrup.yml');
        process.exit(0); // Keluar setelah selesai
    } catch (err) {
        console.error('Gagal mengambil grup atau menyimpan file:', err);
    }
};

startBot();