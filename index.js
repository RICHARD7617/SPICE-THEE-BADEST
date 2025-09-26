///DON'T COPY WITHOUT PERMISSION//
/**
 * SPICE-THEE-BADDEST - WhatsApp Bot
 * * Copyright (c) 2025 His excellency
 * Licensed under the MIT License
 * * ⚠ DO NOT REMOVE THIS HEADER ⚠
 * * - Modifying, rebranding, or redistributing without proper credit is strictly prohibited.
 * - Cloning this project without visible author attribution may result in takedown.
 * - Author: SPICE-THEE-BADDEST | GitHub: https://github.com/RICHARD7617/SPICE-THEE-BADEST
 * * Any fork must retain visible credits in both code and output.
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await: awaitFunc, sleep, reSize } = require('./lib/myfunc') // Renamed 'await' to 'awaitFunc' to avoid keyword conflict
const { 
    default: makeWASocket,
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Create a store object with required methods
const store = {
    messages: {},
    contacts: {},
    chats: {},
    groupMetadata: async (jid) => {
        return {}
    },
    bind: function(ev) {
        // Handle events
        ev.on('messages.upsert', ({ messages }) => {
            messages.forEach(msg => {
                if (msg.key && msg.key.remoteJid) {
                    // Check for valid message content structure
                    if (msg.message) {
                        this.messages[msg.key.remoteJid] = this.messages[msg.key.remoteJid] || {}
                        this.messages[msg.key.remoteJid][msg.key.id] = msg
                    }
                }
            })
        })
        
        ev.on('contacts.update', (contacts) => {
            contacts.forEach(contact => {
                if (contact.id) {
                    this.contacts[contact.id] = contact
                }
            })
        })
        
        ev.on('chats.set', (chats) => {
            // chats.chats is an array in recent Baileys versions
            if (Array.isArray(chats.chats)) {
                chats.chats.forEach(chat => {
                    this.chats[chat.id] = chat;
                });
            } else {
                this.chats = chats;
            }
        })
    },
    loadMessage: async (jid, id) => {
        return store.messages[jid]?.[id] || null // Use store in loadMessage
    }
}

let phoneNumber = "254116813644"
// Ensure owner is an array of JIDs if used for checks later, or keep it as parsed JSON
// Assuming owner.json contains an array of numbers like ["254116813644", "2547XXXXXXXX"]
let owner = JSON.parse(fs.readFileSync('./data/owner.json')) // Keep as is, but note its structure for later use

global.botname = "SPICE-THEE-BADDEST"
global.themeemoji = "•"

const settings = require('./settings')
// Use a constant for session path
const SESSION_PATH = './session'
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // Fallback for non-interactive environment, using default number
        // This makes more sense than using ownerNumber from settings as a fallback for the bot's own number.
        return Promise.resolve(phoneNumber) 
    }
}

            
async function startXeonBotInc() {
    let { version, isLatest } = await fetchLatestBaileysVersion()
    // Use SESSION_PATH constant
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH) 
    const msgRetryCounterCache = new NodeCache()

    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !pairingCode,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        // The getMessage function must return the raw protobuf message object, not an empty string if not found.
        getMessage: async (key) => {
            let jid = jidNormalizedUser(key.remoteJid)
            let msg = await store.loadMessage(jid, key.id)
            return msg?.message || { conversation: "" } // Return a simple object if not found
        },
        msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined,
    })

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            // Fixed: Safely access the first message and handle the structure
            const mek = chatUpdate.messages[0]
            if (!mek) return // Check if message exists
            
            // Normalize message structure (ephemeral, viewOnce, etc.)
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.message && Object.keys(mek.message)[0] === 'viewOnceMessageV2') {
                mek.message = mek.message.viewOnceMessageV2.message;
            } else if (mek.message && Object.keys(mek.message)[0] === 'viewOnceMessage') {
                mek.message = mek.message.viewOnceMessage.message;
            }
            
            if (!mek.message) return // Check again after normalization

            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            // Use || for logical OR, not &&. Also, ensure public property exists
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
            
            // Serialize message before passing to handler (best practice)
            const m = smsg(XeonBotInc, mek, store)
            
            try {
                // Pass serialized message 'm' instead of raw 'chatUpdate' to follow smsg pattern
                await handleMessages(XeonBotInc, m, true) 
            } catch (err) {
                console.error("Error in handleMessages:", err)
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, { 
                        text: '❌ An error occurred while processing your message.\n```' + err.message + '```', // Include error message
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: false,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363400480173280@newsletter', // Use a standard dummy JID
                                newsletterName: '𝐃𝐀𝐕𝐄-𝐗𝐌𝐃',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    // Fixed error in XeonBotInc.getName where this.withoutContact was used instead of XeonBotInc.withoutContact
    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact 
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            // Use store.groupMetadata which is defined (even if it returns an empty object)
            v = store.contacts[id] || {} 
            if (!(v.name || v.subject)) v = await store.groupMetadata(id) || {} // Await metadata
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user?.id) ? // Added optional chaining for user ID
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Handle pairing code
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let inputPhoneNumber
        if (!!global.phoneNumber) {
            inputPhoneNumber = global.phoneNumber
        } else {
            inputPhoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 2547XXXXX (without + or spaces) : `)))
        }

        // Clean the phone number - remove any non-digit characters
        inputPhoneNumber = inputPhoneNumber.replace(/[^0-9]/g, '')

        // Validate the phone number using awesome-phonenumber
        const pn = require('awesome-phonenumber');
        if (!pn('+' + inputPhoneNumber).isValid()) {
            console.log(chalk.red('Invalid phone number. Please enter your full international number (e.g., 255792021944 for Tanzania, 254798570132 for Kenya, etc.) without + or spaces.'));
            // Use rl.close() if it exists before exiting
            if (rl) rl.close() 
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                const { pairingCode } = await XeonBotInc.requestPairingCode(inputPhoneNumber)
                const code = pairingCode?.match(/.{1,4}/g)?.join("-") || pairingCode
                console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
            } catch (error) {
                console.error('Error requesting pairing code:', error)
                console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
                if (rl) rl.close()
                process.exit(1)
            }
        }, 3000)
    }

    // Connection handling
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect } = s
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`♻Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
            
            const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
            await XeonBotInc.sendMessage(botNumber, { 
                text: 
                `
┏❐═⭔ CONNECTED ⭔═❐
┃⭔ Bot: SPICE-THEE-BADDEST
┃⭔ Time: ${new Date().toLocaleString()}
┃⭔ Status: Online
┃⭔ User: ${botNumber}
┗❐═⭔════════⭔═❐`,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: false,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363400480173280@newsletter',
                        newsletterName: '𝐃𝐀𝐕𝐄-𝐌𝐃',
                        serverMessageId: -1
                    }
                }
            });

            await delay(1999)
            // Fixed template literals: use backticks (`) and ${}
            console.log(chalk.yellow(`\n\n    ${chalk.bold.blue(`[ ${global.botname || 'SPICE-THEE-BADDEST'} ]`)}\n\n`))
            console.log(chalk.cyan(`< ================================================== >`))
            console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: spiceke`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: giftdee`))
            // Owner is an array, printing it directly might be messy.
            console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner.join(', ')}`)) 
            console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: SPICE`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
            console.log(chalk.cyan(`< ================================================== >`))
        }
        if (
            connection === "close" &&
            lastDisconnect &&
            lastDisconnect.error &&
            lastDisconnect.error.output.statusCode != DisconnectReason.loggedOut // Use constant
        ) {
            // Add a small delay before reconnecting
            await sleep(5000)
            startXeonBotInc()
        }
        
        // Handle explicit logout
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
            console.log(chalk.red('Logged out. Deleting session and stopping.'))
            // Delete session folder
            if (existsSync(SESSION_PATH)) {
                rmSync(SESSION_PATH, { recursive: true, force: true });
            }
            if (rl) rl.close()
            process.exit(0);
        }
    })

    XeonBotInc.ev.on('creds.update', saveCreds)
    
    // The following event handlers were redundant or misplaced.
    // Group participant updates should use the dedicated handler:
    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    // The messages.upsert handler already covers the status@broadcast check.
    // The following two are redundant if the first messages.upsert handler is used.
    /*
    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });
    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });
    */

    // Baileys 'messages.reaction' event is correct for reactions.
    XeonBotInc.ev.on('messages.reaction', async (reaction) => {
        // Renamed 'status' to 'reaction' for clarity, assuming handleStatus can process it.
        await handleStatus(XeonBotInc, reaction); 
    });

    return XeonBotInc
}


// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    // Close readline interface if it exists
    if (rl) rl.close() 
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    // Fixed template literal syntax
    console.log(chalk.redBright(`Update ${__filename}`)) 
    delete require.cache[file]
    require(file)
})///DON'T COPY WITHOUT PERMISSION//
/**
 * SPICE-THEE-BADDEST - WhatsApp Bot
 * 
 * Copyright (c) 2025 His excellency
 * Licensed under the MIT License
 * 
 * ⚠ DO NOT REMOVE THIS HEADER ⚠
 * 
 * - Modifying, rebranding, or redistributing without proper credit is strictly prohibited.
 * - Cloning this project without visible author attribution may result in takedown.
 * - Author: SPICE-THEE-BADDEST | GitHub: https://github.com/RICHARD7617/SPICE-THEE-BADEST
 * 
 * Any fork must retain visible credits in both code and output.
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const { 
    default: makeWASocket,
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Create a store object with required methods
const store = {
    messages: {},
    contacts: {},
    chats: {},
    groupMetadata: async (jid) => {
        return {}
    },
    bind: function(ev) {
        // Handle events
        ev.on('messages.upsert', ({ messages }) => {
            messages.forEach(msg => {
                if (msg.key && msg.key.remoteJid) {
                    this.messages[msg.key.remoteJid] = this.messages[msg.key.remoteJid] || {}
                    this.messages[msg.key.remoteJid][msg.key.id] = msg
                }
            })
        })
        
        ev.on('contacts.update', (contacts) => {
            contacts.forEach(contact => {
                if (contact.id) {
                    this.contacts[contact.id] = contact
                }
            })
        })
        
        ev.on('chats.set', (chats) => {
            this.chats = chats
        })
    },
    loadMessage: async (jid, id) => {
        return this.messages[jid]?.[id] || null
    }
}

let phoneNumber = "254116813644"
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "SPICE-THEE-BADDEST"
global.themeemoji = "•"

const settings = require('./settings')
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environment, use ownerNumber from settings
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}

         
async function startXeonBotInc() {
    let { version, isLatest } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(./session)
    const msgRetryCounterCache = new NodeCache()

    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !pairingCode,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            let jid = jidNormalizedUser(key.remoteJid)
            let msg = await store.loadMessage(jid, key.id)
            return msg?.message || ""
        },
        msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined,
    })

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
            
            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, { 
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: false,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '@newsletter',
                                newsletterName: '𝐃𝐀𝐕𝐄-𝐗𝐌𝐃',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact 
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Handle pairing code
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 2547XXXXX (without + or spaces) : `)))
        }

        // Clean the phone number - remove any non-digit characters
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        // Validate the phone number using awesome-phonenumber
        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Invalid phone number. Please enter your full international number (e.g., 255792021944 for Tanzania, 254798570132 for Kenya, etc.) without + or spaces.'));
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                console.log(chalk.yellow(\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above))
            } catch (error) {
                console.error('Error requesting pairing code:', error)
                console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
            }
        }, 3000)
    }

    // Connection handling
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect } = s
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`♻Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
            
            const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
            await XeonBotInc.sendMessage(botNumber, { 
                text: 
                `
┏❐═⭔ CONNECTED ⭔═❐
┃⭔ Bot: SPICE-THEE-BADDEST
┃⭔ Time: ${new Date().toLocaleString()}
┃⭔ Status: Online
┃⭔ User: ${botNumber}
┗❐═⭔════════⭔═❐`,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: false,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363400480173280@newsletter',
                        newsletterName: '𝐃𝐀𝐕𝐄-𝐌𝐃',
                        serverMessageId: -1
                    }
                }
            });

            await delay(1999)
            console.log(chalk.yellow(\n\n    ${chalk.bold.blue([ ${global.botname || 'SPICE-THEE-BADDEST'} ])}\n\n))
            console.log(chalk.cyan(< ================================================== >))
            console.log(chalk.magenta(\n${global.themeemoji || '•'} YT CHANNEL: spiceke))
            console.log(chalk.magenta(${global.themeemoji || '•'} GITHUB: giftdee))
            console.log(chalk.magenta(${global.themeemoji || '•'} WA NUMBER: ${owner}))
            console.log(chalk.magenta(${global.themeemoji || '•'} CREDIT: SPICE))
            console.log(chalk.green(${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅))
            console.log(chalk.cyan(< ================================================== >))
        }
        if (
            connection === "close" &&
            lastDisconnect &&
            lastDisconnect.error &&
            lastDisconnect.error.output.statusCode != 401
        ) {
            startXeonBotInc()
        }
    })

    XeonBotInc.ev.on('creds.update', saveCreds)
    
    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
}


// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(Update ${__filename}))
    delete require.cache[file]
    require(file)
})


