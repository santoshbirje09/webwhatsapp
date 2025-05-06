// const express = require('express');
// const qrcode = require('qrcode');
// const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

// const app = express();
// const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');


// let sock;
// let currentQR = null;
// let isConnected = false;

// async function connectToWhatsApp() {
//     sock = makeWASocket({
//         auth: state,
//         printQRInTerminal: false,
//     });

//     sock.ev.on('creds.update', saveState);

//     sock.ev.on('connection.update', async (update) => {
//         const { connection, qr, lastDisconnect } = update;

//         if (qr) {
//             currentQR = await qrcode.toDataURL(qr);
//             console.log('📸 QR updated');
//             setTimeout(() => currentQR = null, 20000);
//         }

//         if (connection === 'open') {
//             isConnected = true;
//             console.log('✅ WhatsApp connected!');
//         }

//         if (connection === 'close') {
//             const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
//             isConnected = false;
//             if (reason !== DisconnectReason.loggedOut) {
//                 console.log('🔄 Reconnecting...');
//                 connectToWhatsApp();
//             } else {
//                 console.log('❌ Logged out.');
//             }
//         }
//     });
// }

// connectToWhatsApp();

// // Serve QR image
// app.get('/qr', (req, res) => {
//     if (isConnected) return res.status(204).send(); // No content if logged in
//     if (!currentQR) return res.status(404).send('QR not available');
//     const img = Buffer.from(currentQR.split(',')[1], 'base64');
//     res.writeHead(200, {
//         'Content-Type': 'image/png',
//         'Content-Length': img.length,
//         'Cache-Control': 'no-store',
//     });
//     res.end(img);
// });

// // Frontend page
// app.get('/', (req, res) => {
//     res.send(`
//     <html>
//     <head><title>WhatsApp Login</title></head>
//     <body>
//         <h2 id="status">Connecting...</h2>
//         <img id="qr" width="300" height="300" style="display:none"/>
//         <script>
//             async function updateQR() {
//                 try {
//                     const res = await fetch('/qr?' + new Date().getTime());
//                     if (res.status === 200) {
//                         const blob = await res.blob();
//                         document.getElementById('qr').src = URL.createObjectURL(blob);
//                         document.getElementById('qr').style.display = 'block';
//                         document.getElementById('status').innerText = 'Scan the QR code to login';
//                     } else if (res.status === 204) {
//                         document.getElementById('qr').style.display = 'none';
//                         document.getElementById('status').innerText = '✅ You are logged in!';
//                     } else {
//                         document.getElementById('qr').style.display = 'none';
//                         document.getElementById('status').innerText = '⚠️ QR not available';
//                     }
//                 } catch (err) {
//                     document.getElementById('status').innerText = '❌ Error loading QR';
//                 }
//             }
//             updateQR();
//             setInterval(updateQR, 20000);
//         </script>
//     </body>
//     </html>
//     `);
// });

// const PORT = 3000;
// app.listen(PORT, () => console.log(`🌐 Server running at http://localhost:${PORT}`));



const express = require('express');
const qrcode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json()); // required for POST /send-message

let sock;
let currentQR = null;
let isConnected = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

    sock = makeWASocket({ auth: state, printQRInTerminal: false });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            currentQR = await qrcode.toDataURL(qr);
            console.log('📸 QR generated');
            setTimeout(() => (currentQR = null), 20000);
        }

        if (connection === 'open') {
            isConnected = true;
            console.log('✅ WhatsApp connected');
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;

            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...');
                await startBot();
            } else {
                console.log('❌ Logged out — deleting session');

                const sessionPath = path.join(__dirname, 'auth_info_baileys');
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    console.log('🗑️ Session folder removed');
                }

                setTimeout(() => {
                    console.log('📦 Restarting bot for new QR...');
                    startBot();
                }, 1000);
            }
        }
    });
}

startBot();

app.get('/qr', (req, res) => {
    if (isConnected) return res.status(204).send(); // No content
    if (!currentQR) return res.status(404).send('QR expired');
    const img = Buffer.from(currentQR.split(',')[1], 'base64');
    res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': img.length,
        'Cache-Control': 'no-store',
    });
    res.end(img);
});

app.get('/', (req, res) => {
    res.send(`
    <html>
    <head><title>WhatsApp Login</title></head>
    <body>
        <h2 id="status">Connecting to WhatsApp...</h2>
        <img id="qr" width="300" height="300" style="display:none"/>
        <script>
            async function fetchQR() {
                try {
                    const res = await fetch('/qr?' + new Date().getTime());
                    if (res.status === 200) {
                        const blob = await res.blob();
                        document.getElementById('qr').src = URL.createObjectURL(blob);
                        document.getElementById('qr').style.display = 'block';
                        document.getElementById('status').innerText = '📲 Scan the QR to log in';
                    } else if (res.status === 204) {
                        document.getElementById('qr').style.display = 'none';
                        document.getElementById('status').innerText = '✅ You are logged in!';
                    } else {
                        document.getElementById('qr').style.display = 'none';
                        document.getElementById('status').innerText = '⚠️ QR not available';
                    }
                } catch (err) {
                    document.getElementById('status').innerText = '❌ Failed to load QR';
                }
            }

            fetchQR();
            setInterval(fetchQR, 20000);
        </script>
    </body>
    </html>
    `);
});

// ✅ NEW: Send message API
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ error: 'Missing number or message' });
    }

    if (!sock || !isConnected) {
        return res.status(503).json({ error: 'WhatsApp not connected' });
    }

    try {
        const id = number.includes('@s.whatsapp.net') ? number : number + '@s.whatsapp.net';
        await sock.sendMessage(id, { text: message });
        res.status(200).json({ success: true, to: number, message });
    } catch (err) {
        console.error('❌ Failed to send message:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🌐 Web interface running: http://localhost:${PORT}`);
});
