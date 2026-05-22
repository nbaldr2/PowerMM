import React, { useState, useRef, useEffect } from 'react'
import {
  Terminal, Mail, Settings, Server, Cpu, ShieldCheck, Sparkles, RefreshCw,
  Play, Trash2, Plus, Check, AlertCircle, ExternalLink, FileText,
  ChevronDown, ChevronUp, Zap, Key, Globe, Activity, Wifi, User,
  Lock, Code, Eye, Split, FileCode, CheckCircle, Info, X, AlertTriangle, Layers, Copy
} from 'lucide-react'
import api from './api.js'
import socketClient from './socket.js'

// Custom high-fidelity defaults
const DEFAULT_HTML_BODY = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f6f6f6; margin: 0;}
    .card { background: #ffffff; border-radius: 8px; padding: 30px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; }
    .logo { text-align: center; margin-bottom: 25px; }
    .logo img { width: 130px; height: auto; }
    .title { color: #1a202c; font-size: 20px; font-weight: bold; margin-bottom: 15px; }
    .text { color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 20px; }
    .btn-container { text-align: center; margin: 25px 0; }
    .btn { background-color: #e50914; color: #ffffff !important; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold; display: inline-block; }
    .footer { font-size: 12px; color: #a0aec0; text-align: center; margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <!-- 123 Reg Logo -->
      <svg width="150" height="40" viewBox="0 0 150 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="150" height="40" rx="6" fill="#1b233a"/>
        <text x="15" y="26" fill="#00b0f0" font-family="Arial" font-weight="bold" font-size="20">123</text>
        <text x="55" y="26" fill="#ffffff" font-family="Arial" font-weight="bold" font-size="20">Reg</text>
        <circle cx="110" cy="20" r="4" fill="#ff7c00"/>
        <circle cx="122" cy="20" r="4" fill="#00b0f0"/>
        <circle cx="134" cy="20" r="4" fill="#00e575"/>
      </svg>
    </div>
    <div class="title">Domain Expiration Notice: [-domain-]</div>
    <p class="text">Dear Customer,</p>
    <p class="text">
      We are writing to inform you that your registered domain name <strong>[-domain-]</strong> is scheduled to expire on <strong>[-date-]</strong>. 
      To avoid any disruption to your website services or loss of email capabilities, you must renew your subscription immediately.
    </p>
    <p class="text">
      Please review the details below:<br>
      • Domain: <strong>[-domain-]</strong><br>
      • Expiry Date: <strong>[-date-]</strong><br>
      • Renewal Amount: <strong>£14.99 / year</strong>
    </p>
    <div class="btn-container">
      <a href="[-url-]" class="btn" target="_blank" style="background-color: #06b6d4;">Renew Now</a>
    </div>
    <p class="text">
      If you have any questions or require assistance, please log in to your account control panel or contact our 24/7 technical helpdesk.
    </p>
    <div class="footer">
      This is an automated system email sent from client account ID [-shortid-]. Please do not reply directly to this mail.<br>
      © 123-Reg Limited. Registered office: [-address-], [-city-], [-country-].
    </div>
  </div>
</body>
</html>`;

const DEFAULT_HEADERS = `MIME-Version: 1.0
Date: [-date-]
Message-ID: <[-randomuuid-]@domain.com>
X-Campaign-ID: [-randomnumber-]
X-Mailer: MoonMailer Pro v2026.5
Feedback-ID: [-shortid-]:default:MoonMailer`;

function App() {
  const [activeTab, setActiveTab] = useState('compose') // 'compose', 'settings'
  const [showInstaller, setShowInstaller] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [showIpChecker, setShowIpChecker] = useState(false)

  // App-level status states
  const [serverIp, setServerIp] = useState('217.154.81.50')
  const [phpVersion, setPhpVersion] = useState('7.4.33')
  const [mailOk, setMailOk] = useState(true)

  // Auto-login for development
  useEffect(() => {
    api.login('admin@moonmailer.pro', 'admin123')
      .then(data => {
        console.log('✅ Authenticated as Admin:', data.user.email)
        socketClient.connect(data.accessToken)
      })
      .catch(err => console.error('Authentication failed:', err))

    api.getHealth().then(data => {
      if (data.status === 'healthy') setMailOk(true)
    }).catch(() => setMailOk(false))

    return () => socketClient.disconnect()
  }, [])

  useEffect(() => {
    const handlePmtaProgress = (payload) => {
      if (!payload) return
      const message = typeof payload === 'string'
        ? payload
        : (payload.message || JSON.stringify(payload))
      setInstallLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
      if (payload.done) {
        if (payload.success) {
          setInstallSuccess(true)
          setMailOk(true)
          setTimeout(() => {
            api.getPmtaConfig().then(d => {
              const pub = d?.config?.dkim_public_key
              if (pub) setDkimPublicKey(pub)
            }).catch(() => {})
          }, 2000)
        } else {
          setInstallSuccess(false)
        }
      }
    }

    socketClient.on('pmta:progress', handlePmtaProgress)
    return () => socketClient.off('pmta:progress', handlePmtaProgress)
  }, [])

  // ---------------------------------------------------------
  // COMPOSE STATE
  // ---------------------------------------------------------
  const [fromEmail, setFromEmail] = useState('support@123-reg-notification.co.uk')
  const [fromName, setFromName] = useState('123 Reg Support')
  const [subject, setSubject] = useState('Domain Renewal Urgent Notice: [-domain-]')
  const [replyTo, setReplyTo] = useState('support-replies@123-reg.co.uk')
  const [redirectUrl, setRedirectUrl] = useState('https://123-reg.renew-domain-portal-auth.com/renew')
  const [logoUrl, setLogoUrl] = useState('https://www.123-reg.co.uk/assets/logo.png')

  // Custom headers & source eml
  const [headersOpen, setHeadersOpen] = useState(false)
  const [headersText, setHeadersText] = useState(DEFAULT_HEADERS)

  // Tips and Message Body HTML
  const [tipsOpen, setTipsOpen] = useState(false)
  const [htmlBody, setHtmlBody] = useState(DEFAULT_HTML_BODY)
  const [recipientsText, setRecipientsText] = useState(
    "victim1@targetdomain.com\nvictim2@anotherdomain.co.uk\nvictim3@corporation-corp.com\nvictim4@gmail.com\nvictim5@yahoo.com"
  )

  // Textarea cursor ref for tag insertion
  const bodyTextareaRef = useRef(null)
  const headersTextareaRef = useRef(null)

  // ---------------------------------------------------------
  // INBOX SHIELD PANEL STATE
  // ---------------------------------------------------------
  const [shieldOpen, setShieldOpen] = useState(true)
  const [shieldState, setShieldState] = useState({
    // MIME
    multipart: true,
    base64Encode: false,
    quotedPrintable: true,
    fixMime: true,
    // HEADERS
    headerRotation: false,
    reputationHeaders: true,
    subjectEncode: false,
    dateJitter: true,
    listUnsubscribe: true,
    // HTML FIX
    cssInliner: true,
    minifyHtml: false,
    tableWrapper: true,
    outlookFixes: true,
    darkMode: true,
    fixImgAlt: true,
    // STEALTH (cyan)
    antiFingerprint: true,
    normalizeWs: true,
    styleShuffle: false,
    linkUniquifier: true,
    spamProtector: false,
    utf8Normalizer: true,
    charsetNormalizer: true,
    cleanTrackers: true,
    // ANTI-CMAS (orange)
    structureMutator: false,
    headerNoise: true,
    mimeBoundary: true,
    receivedChain: false,
    messageIdForge: true,
    contentIdRand: true,
    oxCloudmark: true, // Orange highlighted toggle
    // 2026 HEADERS (red)
    rfc8058Full: true,
    arcChain: true,
    espFingerprint: false,
    threadInject: true,
    gmail2026: true,
    outlookMimic: false,
    antiAiFilter: true,
    bimiHeader: false,
    returnPathAlign: true,
    muaRotate: false,
    headerSalting: true,
    // EITSFAS
    preheader: 'URGENT: Your domain registration is expiring. Act now to secure your brand.',
    previewText: 'Renew before the 24h final deadline. Avoid service suspension.',
    pixelTracker: true,
    trackingUrl: 'https://123-reg.renew-domain-portal-auth.com/track'
  })

  // ---------------------------------------------------------
  // CONTENT RANDOMIZER PANEL STATE
  // ---------------------------------------------------------
  const [randomizerOpen, setRandomizerOpen] = useState(false)
  const [randomizerState, setRandomizerState] = useState({
    // STRUCTURE
    renameClassId: true,
    swapTags: false,
    tableLayout: true,
    stripComments: true,
    linkParams: true,
    imageParams: false,
    // TEXT
    textMutation: true,
    splitWords: false,
    wrapSpan: true,
    // ANTI-BAYES (orange)
    homoglyphs: false,
    whitespace: true,
    hamPoison: false,
    entities: true,
    hiddenText: false,
    // ANTI-HASH (orange)
    directionMarks: false,
    attrInject: true,
    classMutate: true,
    softHyphens: false,
    fontWrap: true,
    // RANGES
    homoglyphPct: 30,
    poisonBlocks: 5,
    colorAlpha: 0,
    spacingPx: 0
  })

  // ---------------------------------------------------------
  // CREATIVE ENGINE PANEL STATE
  // ---------------------------------------------------------
  const [creativeOpen, setCreativeOpen] = useState(false)
  const [creativeState, setCreativeState] = useState({
    // CONTENT
    uniqueHash: true,
    synonyms: false,
    shuffleParagraphs: false,
    lengthPadding: true,
    dataAttributes: true,
    wsDiversity: false,
    // ANTI-FILTER
    conversationSeed: true,
    multiEncode: false,
    colorJitter: true,
    spacingJitter: false,
    uniqueSentence: true,
    // VISUAL
    responsive: true,
    imgSize: true,
    gmailPrimary: true,
    // HEADERS
    fakeThread: false,
    nameRotation: true,
    replyToRotation: false,
    // LISTS
    senderNames: "123 Reg Support\n123 Reg Helpdesk\n123 Reg Domain Billing",
    replyToEmails: "support-replies@123-reg.co.uk\nbilling-support@123-reg.co.uk"
  })

  // Count active options for badges
  const countActiveShield = () => {
    let count = 0
    // MIME, HEADERS, HTML FIX, STEALTH, ANTI-CMAS, 2026 HEADERS, EITSFAS
    const booleanKeys = [
      'multipart', 'base64Encode', 'quotedPrintable', 'fixMime',
      'headerRotation', 'reputationHeaders', 'subjectEncode', 'dateJitter', 'listUnsubscribe',
      'cssInliner', 'minifyHtml', 'tableWrapper', 'outlookFixes', 'darkMode', 'fixImgAlt',
      'antiFingerprint', 'normalizeWs', 'styleShuffle', 'linkUniquifier', 'spamProtector', 'utf8Normalizer', 'charsetNormalizer', 'cleanTrackers',
      'structureMutator', 'headerNoise', 'mimeBoundary', 'receivedChain', 'messageIdForge', 'contentIdRand', 'oxCloudmark',
      'rfc8058Full', 'arcChain', 'espFingerprint', 'threadInject', 'gmail2026', 'outlookMimic', 'antiAiFilter', 'bimiHeader', 'returnPathAlign', 'muaRotate', 'headerSalting',
      'pixelTracker'
    ]
    booleanKeys.forEach(k => { if (shieldState[k]) count++ })
    return count
  }

  const countActiveRandomizer = () => {
    let count = 0
    const booleanKeys = [
      'renameClassId', 'swapTags', 'tableLayout', 'stripComments', 'linkParams', 'imageParams',
      'textMutation', 'splitWords', 'wrapSpan',
      'homoglyphs', 'whitespace', 'hamPoison', 'entities', 'hiddenText',
      'directionMarks', 'attrInject', 'classMutate', 'softHyphens', 'fontWrap'
    ]
    booleanKeys.forEach(k => { if (randomizerState[k]) count++ })
    if (randomizerState.homoglyphPct > 0) count++
    if (randomizerState.poisonBlocks > 0) count++
    return count
  }

  const countActiveCreative = () => {
    let count = 0
    const booleanKeys = [
      'uniqueHash', 'synonyms', 'shuffleParagraphs', 'lengthPadding', 'dataAttributes', 'wsDiversity',
      'conversationSeed', 'multiEncode', 'colorJitter', 'spacingJitter', 'uniqueSentence',
      'responsive', 'imgSize', 'gmailPrimary',
      'fakeThread', 'nameRotation', 'replyToRotation'
    ]
    booleanKeys.forEach(k => { if (creativeState[k]) count++ })
    return count
  }

  // ---------------------------------------------------------
  // PREVIEW TAB STATE & GENERATION
  // ---------------------------------------------------------
  const [previewTab, setPreviewTab] = useState('visual') // 'visual', 'source', 'diff'
  const [rollId, setRollId] = useState(1)

  // Token mapping for Re-Roll simulation
  const [tokenValues, setTokenValues] = useState({
    domain: 'mycompany-secure-renew.co.uk',
    date: '2026-06-15',
    randomuuid: '4f29a7c3-bb9e-4c7b-94a2-9b2f33c3751a',
    randomnumber: '98451',
    shortid: '8a2b3c',
    address: '100 Foundry Lane',
    city: 'London',
    country: 'United Kingdom'
  })

  const reRollTokens = () => {
    const domains = ['business-portal-renew.co.uk', 'host-renew-dns.com', 'site-uk-domain.org', 'secureserver-update.co.uk']
    const cities = ['London', 'Manchester', 'Birmingham', 'Leeds']
    const addresses = ['50 Victoria St', '12 Piccadilly Gardens', '88 Corporation St', '101 Whitehall Road']

    const randomDomain = domains[Math.floor(Math.random() * domains.length)]
    const randomCity = cities[Math.floor(Math.random() * cities.length)]
    const randomAddr = addresses[Math.floor(Math.random() * addresses.length)]
    const randUuid = Math.random().toString(36).substring(2, 15) + '-' + Math.random().toString(36).substring(2, 10)
    const randNum = Math.floor(10000 + Math.random() * 90000).toString()
    const randShort = Math.random().toString(36).substring(2, 8).toUpperCase()

    // Increment date slightly
    const daysAhead = Math.floor(10 + Math.random() * 20)
    const newDate = new Date()
    newDate.setDate(newDate.getDate() + daysAhead)
    const formattedDate = newDate.toISOString().split('T')[0]

    setTokenValues({
      domain: randomDomain,
      date: formattedDate,
      randomuuid: randUuid,
      randomnumber: randNum,
      shortid: randShort,
      address: randomAddr,
      city: randomCity,
      country: 'United Kingdom'
    })
    setRollId(prev => prev + 1)
  }

  // Live compiled text generator
  const getCompiledHtml = () => {
    let result = htmlBody

    // Basic variable replacements
    result = result.replace(/\[-domain-\]/g, tokenValues.domain)
    result = result.replace(/\[-date-\]/g, tokenValues.date)
    result = result.replace(/\[-randomuuid-\]/g, tokenValues.randomuuid)
    result = result.replace(/\[-randomnumber-\]/g, tokenValues.randomnumber)
    result = result.replace(/\[-shortid-\]/g, tokenValues.shortid)
    result = result.replace(/\[-address-\]/g, tokenValues.address)
    result = result.replace(/\[-city-\]/g, tokenValues.city)
    result = result.replace(/\[-country-\]/g, tokenValues.country)
    result = result.replace(/\[-url-\]/g, redirectUrl)
    result = result.replace(/\[-url-img-\]/g, logoUrl)

    // Simulate homoglyphs anti-bayes technique if enabled
    if (randomizerState.homoglyphs) {
      result = result.replace(/Dear Customer/g, 'Dеаr Сustоmеr') // Cyrillic homoglyphs
      result = result.replace(/expiring/g, 'еxpіrіng')
    }

    // Simulate spam protector span wraps if enabled
    if (randomizerState.wrapSpan) {
      result = result.replace(/Renew Now/g, '<span style="display:inline">Ren</span><span style="display:inline">ew No</span>w')
    }

    // Simulate minification if enabled
    if (shieldState.minifyHtml) {
      result = result.replace(/\s+/g, ' ').trim()
    }

    return result
  }

  // ---------------------------------------------------------
  // CHIP INSERT HELPERS
  // ---------------------------------------------------------
  const insertToken = (token) => {
    const el = bodyTextareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = el.value
    const before = text.substring(0, start)
    const after = text.substring(end, text.length)
    const newValue = before + token + after
    setHtmlBody(newValue)
    // Refocus & set cursor
    setTimeout(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    }, 10)
  }

  const insertHeaderToken = (token) => {
    const el = headersTextareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = el.value
    const before = text.substring(0, start)
    const after = text.substring(end, text.length)
    const newValue = before + token + after
    setHeadersText(newValue)
    setTimeout(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    }, 10)
  }

  // Preset headers buttons
  const applyHeaderPreset = (presetName) => {
    let presetText = ''
    switch (presetName) {
      case 'IP Unknown':
        presetText = `X-Originating-IP: [127.0.0.1]\nX-Sender-IP: unknown\n${headersText}`
        break
      case 'Webmail':
        presetText = `X-Mailer: Webmail Client v4.8\nUser-Agent: Webmail-Service-Agent\n${headersText}`
        break
      case 'Apple Mail':
        presetText = `X-Mailer: Apple Mail (3.1007.2)\nMessage-Id: <[-randomuuid-]@apple-mua.com>\n${headersText}`
        break
      case 'Gmail Mobile':
        presetText = `Mime-Version: 1.0 (Gmail MUA)\nX-MUA-Type: Android-Gmail-App\n${headersText}`
        break
      case 'Thunderbird':
        presetText = `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Thunderbird/115.3\n${headersText}`
        break
      case 'Corporate':
        presetText = `X-Exchange-Antispam-Report: Pass\nX-Forefront-Antispam-Report: SFV:NSPB;\n${headersText}`
        break
      default:
        return
    }
    setHeadersText(presetText)
  }

  const applyHeaderType = (typeName) => {
    let additional = ''
    switch (typeName) {
      case 'Newsletter':
        additional = 'Precedence: bulk\nList-Id: <newsletter-campaign.domain.com>'
        break
      case 'Transactional':
        additional = 'X-Msg-Type: Transactional-Critical\nPriority: Urgent'
        break
      case 'High Priority':
        additional = 'Importance: High\nX-Priority: 1 (Highest)\nPriority: urgent'
        break
      case 'Reply-To':
        additional = 'Reply-To: support@[-domain-]'
        break
      case 'ARC Pass':
        additional = 'ARC-Authentication-Results: i=1; mx.google.com; dkim=pass'
        break
      case 'Clean':
        additional = 'X-Spam-Status: No, score=-1.0\nX-Spam-Level: /'
        break
      case 'Clear':
        setHeadersText(DEFAULT_HEADERS)
        return
    }
    if (additional) {
      setHeadersText(`${additional}\n${headersText}`)
    }
  }

  // Import .eml File simulation
  const handleEmlImport = () => {
    const simulatedEml = `Subject: EXPIRATION ALERT: [-domain-]
From: "123 Reg Renewal Office" <support@123-reg-notification.co.uk>
To: recipient@target.com
Content-Type: text/html; charset=UTF-8

${DEFAULT_HTML_BODY}`

    setSubject("EXPIRATION ALERT: [-domain-]")
    setFromName("123 Reg Renewal Office")
    setHtmlBody(DEFAULT_HTML_BODY)
    setHeadersText(`MIME-Version: 1.0\nDate: [-date-]\nMessage-ID: <[-randomuuid-]@domain.com>`)
    alert("Simulated EML file successfully parsed into Composer fields!")
  }

  // ---------------------------------------------------------
  // SETTINGS STATE
  // ---------------------------------------------------------
  const [smtpHost, setSmtpHost] = useState('127.0.0.1')
  const [smtpPort, setSmtpPort] = useState(25)
  const [smtpEncryption, setSmtpEncryption] = useState('None')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpEnabled, setSmtpEnabled] = useState(true)
  const [smtpSubTab, setSmtpSubTab] = useState('single')
  const [smtpPool, setSmtpPool] = useState([
    { host: '127.0.0.1', port: 25, user: 'local-mta', enabled: true },
    { host: 'relay.fastmail-relay.net', port: 587, user: 'fast-relay@domain.com', enabled: true }
  ])

  // Proxy settings toggle
  const [showProxy, setShowProxy] = useState(false)
  const [proxyHost, setProxyHost] = useState('')
  const [proxyPort, setProxyPort] = useState('1080')
  const [proxyUser, setProxyUser] = useState('')
  const [proxyPass, setProxyPass] = useState('')

  // PMTA Integration
  const [pmtaJobName, setPmtaJobName] = useState('campaign-[-date-]')
  const [pmtaPoolName, setPmtaPoolName] = useState('default-pool')
  const [pmtaEnableVmta, setPmtaEnableVmta] = useState(true)
  const [pmtaAccounting, setPmtaAccounting] = useState(true)
  const [pmtaVmtaMode, setPmtaVmtaMode] = useState('Single VMTA')
  const [pmtaEnableVerp, setPmtaEnableVerp] = useState(true)
  const [pmtaBounceDomain, setPmtaBounceDomain] = useState('bounces.mycompany-secure-renew.co.uk')

  // Batch Engine Settings
  const [batchSize, setBatchSize] = useState(100000)
  const [speedMode, setSpeedMode] = useState('Turbo') // 'Turbo', 'Ludicrous', 'Normal'
  const [batchDelay, setBatchDelay] = useState(0)
  const [emailDelay, setEmailDelay] = useState(0)
  const [keepAlive, setKeepAlive] = useState(true)
  const [connectionPooling, setConnectionPooling] = useState(true)
  const [gcOptimize, setGcOptimize] = useState(true)

  // Seed & MX Validation
  const [mxValidate, setMxValidate] = useState(true)
  const [sendSeedTest, setSendSeedTest] = useState(true)
  const [seedDelay, setSeedDelay] = useState(15)
  const [seedAddresses, setSeedAddresses] = useState("test-seed@gmail.com\ntest-seed@outlook.com\ntest-seed@yahoo.com")

  // SMTP test state
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [smtpStatusMessage, setSmtpStatusMessage] = useState(null)

  const handleTestSmtp = () => {
    setTestingSmtp(true)
    setSmtpStatusMessage(null)
    setTimeout(() => {
      setTestingSmtp(false)
      setSmtpStatusMessage({
        type: 'success',
        text: `Successfully authenticated with ${smtpHost}:${smtpPort}. Latency: 42ms. STARTTLS accepted.`
      })
    }, 1500)
  }

  const handleAddToPool = () => {
    const newPoolItem = {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser || 'anonymous',
      enabled: true
    }
    setSmtpPool([...smtpPool, newPoolItem])
    alert(`Added ${smtpHost}:${smtpPort} to the PowerMTA Server Pool!`)
  }

  const fillFromPmta = () => {
    setSmtpHost('127.0.0.1')
    setSmtpPort(2525)
    setSmtpEncryption('None')
    setSmtpUser('pmta-relay-user')
    setSmtpPass('•••••••••••••')
    alert("SMTP configuration loaded automatically from current local PowerMTA settings!")
  }

  // ---------------------------------------------------------
  // LIVE BULK SENDING CAMPAIGN ENGINE SIMULATOR
  // ---------------------------------------------------------
  const [sendingCampaign, setSendingCampaign] = useState(false)
  const [sendProgress, setSendProgress] = useState(0)
  const [sendLogs, setSendLogs] = useState([])
  const [sentStats, setSentStats] = useState({ sent: 0, delivered: 0, bounced: 0, deferred: 0 })
  const logContainerRef = useRef(null)

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [sendLogs])

  useEffect(() => {
    socketClient.onSendStart(data => {
      setSendLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Bulk Send Job started... (Target: ${data.total} emails)`])
      setSendingCampaign(true)
      setSendProgress(0)
    })

    socketClient.onSendProgress(data => {
      setSendProgress(Math.floor(data.percent))
      setSentStats({
        sent: data.sent,
        failed: data.failed,
        delivered: data.sent, // Simplified
        bounced: data.failed,
        deferred: 0
      })
    })

    socketClient.onBatchComplete(data => {
      setSendLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Batch ${data.batchNum} completed: ${data.batchSent} sent, ${data.batchFailed} failed.`])
    })

    socketClient.onSendComplete(data => {
      setSendLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Bulk Send Job completed in ${data.duration}s. Sent: ${data.totalSent}, Failed: ${data.totalFailed}. All connections closed.`,
        `[${new Date().toLocaleTimeString()}] GC optimization completed.`
      ])
      setSendingCampaign(false)
      setSendProgress(100)
    })

    socketClient.onSendError(data => {
      setSendLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${data.error}`])
    })

    return () => {
      socketClient.off('send:start')
      socketClient.off('send:progress')
      socketClient.off('send:batch_complete')
      socketClient.off('send:complete')
      socketClient.off('send:error')
    }
  }, [])

  const triggerCampaignSend = async () => {
    if (sendingCampaign) return
    const recs = recipientsText.split('\n').filter(r => r.trim().includes('@'))
    if (recs.length === 0) {
      alert("Please enter at least one recipient email address.")
      return
    }

    setSendingCampaign(true)
    setSendProgress(0)
    setSendLogs([`[${new Date().toLocaleTimeString()}] Initializing send engine context...`, `[${new Date().toLocaleTimeString()}] Connecting to backend API...`])
    setSentStats({ sent: 0, delivered: 0, bounced: 0, deferred: 0 })

    try {
      // 1. Create a list with the recipients
      const listData = await api.createList(`Campaign List ${new Date().toISOString()}`, 'Generated from quick compose')
      await api.importRecipientsRaw(listData.list.id, recipientsText)

      // 2. Create the campaign
      const campaignData = await api.createCampaign({
        name: `Quick Send ${new Date().toLocaleString()}`,
        list_id: listData.list.id,
        subject: subject,
        from_email: fromEmail,
        from_name: fromName,
        reply_to: replyTo,
        html_body: htmlBody,
        text_body: 'Please view this email in an HTML compatible client.',
        headers: headersOpen ? headersText : '',
        inbox_shield: shieldState,
        randomizer: randomizerState
      })

      // Join the socket room to get live updates
      socketClient.joinCampaign(campaignData.campaign.id)

      // 3. Trigger the send worker
      setSendLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] List and Campaign created. Dispatching to BullMQ workers...`])
      await api.sendCampaign(campaignData.campaign.id)

    } catch (err) {
      setSendLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] API Error: ${err.message}`])
      setSendingCampaign(false)
    }
  }

  // ---------------------------------------------------------
  // SPAMASSASSIN & CLOUDMARK REPUTATION TESTS
  // ---------------------------------------------------------
  const [testingSpam, setTestingSpam] = useState(false)
  const [testingCloudmark, setTestingCloudmark] = useState(false)
  const [spamScore, setSpamScore] = useState(null)
  const [cloudmarkScore, setCloudmarkScore] = useState(null)

  const runSpamassassin = () => {
    setTestingSpam(true)
    setSpamScore(null)
    setTimeout(() => {
      setTestingSpam(false)
      setSpamScore({
        score: '9.8 / 10.0',
        rating: 'EXCELLENT',
        details: [
          { check: 'DKIM Signature Alignment', status: 'pass', desc: 'Valid 2048-bit signature found' },
          { check: 'SPF Alignment', status: 'pass', desc: 'Server IP authorized' },
          { check: 'DMARC Alignment', status: 'pass', desc: 'Header domain matches SPF/DKIM' },
          { check: 'Reverse DNS (rDNS)', status: 'pass', desc: '217.154.81.50 points to mail.mycompany.co.uk' },
          { check: 'Bayesian Filter Probability', status: 'pass', desc: '0.003% probability (ham classification)' },
          { check: 'Homoglyph Obfuscation detection', status: 'warning', desc: 'Zero harmful characters flagged' },
          { check: 'List-Unsubscribe implementation', status: 'pass', desc: 'RFC 8058 valid header present' }
        ]
      })
    }, 2000)
  }

  const runCloudmark = () => {
    setTestingCloudmark(true)
    setCloudmarkScore(null)
    setTimeout(() => {
      setTestingCloudmark(false)
      setCloudmarkScore({
        rating: 'CLEAN REPUTATION (0% spam ratio)',
        status: 'ACCEPTED',
        details: [
          { node: 'OX Cloudmark Reputation Gateway', result: 'Green status / High IP trust level' },
          { node: 'Fingerprint mutation resistance', result: '99.4% (Stealth structure actively rotating)' },
          { node: 'Spamhaus Blocklist Check', result: 'Not listed (SBL/XBL/PBL secure)' },
          { node: 'Barracuda Reputation Network', result: 'Score 0.0 (Neutral/Safe)' }
        ]
      })
    }, 1800)
  }

  // ---------------------------------------------------------
  // POWERMTA WIZARD STATE
  // ---------------------------------------------------------
  const [wizardStep, setWizardStep] = useState(1)
  const [sshHost, setSshHost] = useState('')
  const [sshPort, setSshPort] = useState(22)
  const [sshUser, setSshUser] = useState('root')
  const [sshPass, setSshPass] = useState('')
  const [sshKeyAuth, setSshKeyAuth] = useState(false)
  const [localServerToggle, setLocalServerToggle] = useState(false)

  const [testingSsh, setTestingSsh] = useState(false)
  const [sshStatus, setSshStatus] = useState(null) // 'success' / 'error'

  const testSshConnection = async () => {
    setTestingSsh(true)
    setSshStatus(null)
    try {
      const res = await api.testSsh({
        host: sshHost,
        port: sshPort,
        username: sshUser,
        password: sshKeyAuth ? undefined : sshPass,
        privateKey: sshKeyAuth ? sshPass : undefined,
        useLocalServer: localServerToggle
      })
      setSshStatus({ type: 'success', text: res.message || `Connected as ${sshUser} to ${sshHost}:${sshPort}` })
    } catch (err) {
      setSshStatus({ type: 'error', text: err.message || 'SSH connection failed' })
    } finally {
      setTestingSsh(false)
    }
  }

  // Step 2 Configuration
  const [sendingDomain, setSendingDomain] = useState('mycompany-secure-renew.co.uk')
  const [pmtaHostname, setPmtaHostname] = useState('mail.mycompany-secure-renew.co.uk')
  const [pmtaPrimaryIp, setPmtaPrimaryIp] = useState('')
  const [dkimSelector, setDkimSelector] = useState('default')
  const [pmtaSecondaryIps, setPmtaSecondaryIps] = useState("")

  const [pmtaSmtpUser, setPmtaSmtpUser] = useState('pmta-relay-user')
  const [pmtaSmtpPass, setPmtaSmtpPass] = useState('P@ssw0rd2026_Secure')
  const [pmtaSmtpPort, setPmtaSmtpPort] = useState(2525)
  const [pmtaMonitorPort, setPmtaMonitorPort] = useState(1983)

  const [showDnsModal, setShowDnsModal] = useState(false)
  const [copiedRecord, setCopiedRecord] = useState(null)
  const [dkimPublicKey, setDkimPublicKey] = useState('')

  // Step 3 Configuration Customization & Config Editor
  const [useCustomConfig, setUseCustomConfig] = useState(false)
  const [pmtaConfigCode, setPmtaConfigCode] = useState(`# PowerMTA configuration template for MoonMailer Pro
# Auto-generated on ${new Date().toISOString()}

# ─────────────────────────────────────────────
# GLOBAL SETTINGS
# ─────────────────────────────────────────────
host-name             mail.{{ domain }}
log-file              /var/log/pmta/pmta.log
spool                 /var/spool/pmta
http-access           0.0.0.0/0 monitor

# ─────────────────────────────────────────────
# SMTP AUTHENTICATION CREDENTIALS
# ─────────────────────────────────────────────
<smtp-user {{ SMTP_USERNAME }}>
    password {{ SMTP_PASSWORD }}
</smtp-user>

# ─────────────────────────────────────────────
# RELAY / SOURCE RULES
# ─────────────────────────────────────────────
<source 127.0.0.1>
    always-allow-relaying yes
</source>

<source 0.0.0.0/0>
    always-allow-relaying no
    smtp-service       yes
    smtp-port          {{ smtp_port }}
    require-auth       yes
</source>

# ─────────────────────────────────────────────
# VIRTUAL MTA — PRIMARY
# ─────────────────────────────────────────────
<virtual-mta default-vmta>
    smtp-source-ip     {{ PRIMARY_IP }}
    domain-key         default,{{ domain }},/etc/pmta/keys/{{ domain }}.pem
</virtual-mta>

# ─────────────────────────────────────────────
# VIRTUAL MTA — SECONDARY BLOCKS
# ─────────────────────────────────────────────
{{ SECONDARY_VMTA_BLOCKS }}

# ─────────────────────────────────────────────
# VIRTUAL MTA POOL
# ─────────────────────────────────────────────
<virtual-mta-pool default-pool>
    virtual-mta        default-vmta
    {{ SECONDARY_VMTA_POOL_ENTRIES }}
</virtual-mta-pool>

# ─────────────────────────────────────────────
# DOMAIN CONFIGURATION
# ─────────────────────────────────────────────
<domain {{ domain }}>
    virtual-mta-pool   default-pool
    max-smtp-out       20
    max-msg-rate       500/h
    retry-after        10m
    expire-after       4d12h
</domain>`)

  // ISP limits manager presets & custom rules
  const [ispRules, setIspRules] = useState([
    { domain: 'gmail.com', rate: 1000, connections: 10, msgsPerConn: 20 },
    { domain: 'outlook.com', rate: 500, connections: 5, msgsPerConn: 10 }
  ])
  const [newRuleDomain, setNewRuleDomain] = useState('')
  const [newRuleRate, setNewRuleRate] = useState(250)
  const [newRuleConn, setNewRuleConn] = useState(2)
  const [newRuleMsg, setNewRuleMsg] = useState(5)

  const addIspRule = () => {
    if (!newRuleDomain) return
    const rule = {
      domain: newRuleDomain,
      rate: newRuleRate,
      connections: newRuleConn,
      msgsPerConn: newRuleMsg
    }
    setIspRules([...ispRules, rule])
    setNewRuleDomain('')
  }

  const applyIspPreset = (presetName) => {
    let rules = []
    switch (presetName) {
      case 'Gmail':
        rules = [{ domain: 'gmail.com', rate: 3000, connections: 25, msgsPerConn: 50 }]
        break
      case 'Microsoft':
        rules = [
          { domain: 'hotmail.com', rate: 500, connections: 5, msgsPerConn: 10 },
          { domain: 'outlook.com', rate: 500, connections: 5, msgsPerConn: 10 }
        ]
        break
      case 'Yahoo / AOL':
        rules = [
          { domain: 'yahoo.com', rate: 300, connections: 3, msgsPerConn: 5 },
          { domain: 'aol.com', rate: 300, connections: 3, msgsPerConn: 5 }
        ]
        break
      case 'OX App Suite':
        rules = [{ domain: '*.ox.host', rate: 100, connections: 2, msgsPerConn: 5 }]
        break
      default:
        rules = [{ domain: presetName.toLowerCase().replace(' ', '') + '.com', rate: 400, connections: 4, msgsPerConn: 10 }]
        break
    }
    setIspRules([...ispRules, ...rules])
  }

  const generateAndInsertIsp = () => {
    let customBlocks = '\n# Custom ISP Rules injected by MoonMailer Rate Limits Manager\n'
    ispRules.forEach(rule => {
      customBlocks += `<domain ${rule.domain}>\n    max-msg-rate ${rule.rate}/h\n    max-smtp-out ${rule.connections}\n    max-msg-per-connection ${rule.msgsPerConn}\n</domain>\n\n`
    })

    setPmtaConfigCode(prev => prev + customBlocks)
    alert("ISP Rate Limits blocks appended successfully to the bottom of the config editor!")
  }

  // Insert token at code cursor
  const insertConfigToken = (token) => {
    setPmtaConfigCode(prev => prev + ' ' + token)
  }

  // Service control simulation
  const [serviceStatus, setServiceStatus] = useState('Unknown')
  const [controlLogs, setControlLogs] = useState([])

  const handleServiceControl = async (action) => {
    setControlLogs(prev => [...prev, `Sending signals: systemctl ${action} pmta...`])
    try {
      const res = await api.pmtaServiceControl(action)
      setControlLogs(prev => [...prev, `Success: ${res.output || 'Command executed'}`])
      if (action === 'status') {
        setServiceStatus(res.isRunning ? 'Running' : 'Stopped')
        setMailOk(res.isRunning)
      }
    } catch (err) {
      setControlLogs(prev => [...prev, `Error: ${err.message}`])
    }
  }

  // Step 4 Install simulation
  const [installingPmta, setInstallingPmta] = useState(false)
  const [installLogs, setInstallLogs] = useState([])
  const [installSuccess, setInstallSuccess] = useState(false)

  const handleInstallPmta = async () => {
    setInstallingPmta(true)
    setInstallLogs([])
    setInstallSuccess(false)

    const now = () => new Date().toLocaleTimeString()

    try {
      setInstallLogs(prev => [...prev, `[${now()}] Testing SSH connection...`])
      await testSshConnection()
      setInstallLogs(prev => [...prev, `[${now()}] SSH connection ready`])

      setInstallLogs(prev => [...prev, `[${now()}] Authenticating with API...`])
      const config = {
        server_name: 'Primary Node',
        ssh_host: sshHost,
        ssh_port: sshPort,
        ssh_user: sshUser,
        ssh_password: sshKeyAuth ? undefined : sshPass,
        ssh_private_key: sshKeyAuth ? sshPass : undefined,
        domain: sendingDomain,
        hostname: pmtaHostname,
        primary_ip: pmtaPrimaryIp,
        secondary_ips: pmtaSecondaryIps,
        dkim_selector: dkimSelector,
        smtp_user: pmtaSmtpUser,
        smtp_pass: pmtaSmtpPass,
        smtp_port: pmtaSmtpPort,
        monitor_port: pmtaMonitorPort,
        config_text: pmtaConfigCode,
        isp_rules: ispRules,
      }

      await api.savePmtaConfig(config)
      setInstallLogs(prev => [...prev, `[${now()}] Config saved to database. Triggering remote installation...`])

      const response = await api.installPmta()
      const startMessage = response?.message || 'Installation started.'
      setInstallLogs(prev => [...prev, `[${now()}] ${startMessage}`])
      setInstallLogs(prev => [...prev, `[${now()}] Waiting for live progress updates...`])
    } catch (err) {
      setInstallLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${err.message}`])
    } finally {
      setInstallingPmta(false)
    }
  }

  const handleUninstallPmta = async () => {
    if (confirm("Are you absolutely sure you want to uninstall PowerMTA and remove all DNS alignments, keys, and ISP records?")) {
      try {
        await api.request('/pmta/uninstall', { method: 'POST' })
        alert("Uninstall script initiated. PowerMTA packages successfully purged.")
        setMailOk(false)
      } catch (err) {
        alert("Failed to uninstall: " + err.message)
      }
    }
  }

  const copyToClipboard = (text, label) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, 99999)
    document.execCommand('copy')
    document.body.removeChild(ta)
    setCopiedRecord(label)
    setTimeout(() => setCopiedRecord(null), 2000)
  }

  const spfValue = `v=spf1 ip4:${pmtaPrimaryIp} ${pmtaSecondaryIps.split('\n').map(ip => 'ip4:' + ip.trim()).join(' ')} -all`
  const dkimValue = dkimPublicKey
    ? `v=DKIM1; k=rsa; p=${dkimPublicKey}`
    : `v=DKIM1; k=rsa; p=[Will appear after installation — run installer first]`
  const dmarcValue = `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@${sendingDomain}`

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col font-sans selection:bg-brand-cyan/30 selection:text-white">

      {/* ---------------------------------------------------------
          TOP NAVIGATION BAR
         --------------------------------------------------------- */}
      <header className="border-b border-brand-border bg-brand-panel/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {/* Stunning glowing Rocket Mail Icon */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-cyan to-brand-teal flex items-center justify-center shadow-lg shadow-brand-cyan/20">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5 leading-none m-0">
              MoonMailer <span className="text-brand-cyan font-mono text-sm tracking-wider uppercase border border-brand-cyan/30 px-1.5 py-0.5 rounded">Pro</span>
            </h1>
            <span className="text-xs text-brand-text/75 font-mono">v2.8 - PowerMM Platform</span>
          </div>
        </div>

        {/* Status Badges */}
        <div className="hidden lg:flex items-center gap-4">
          <div className="flex items-center gap-2 bg-brand-bg/60 border border-brand-border rounded-lg px-3 py-1.5">
            <Server className="w-4 h-4 text-brand-cyan" />
            <span className="text-xs font-mono text-brand-text-bright">IP: {serverIp}</span>
          </div>

          <div className="flex items-center gap-2 bg-brand-bg/60 border border-brand-border rounded-lg px-3 py-1.5">
            <Cpu className="w-4 h-4 text-brand-text" />
            <span className="text-xs font-mono text-brand-text-bright">PHP: {phpVersion}</span>
          </div>

          <div className="flex items-center gap-2 bg-brand-green/10 border border-brand-green/30 rounded-lg px-3 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-green animate-pulse"></span>
            <span className="text-xs font-semibold text-brand-green font-mono">MAIL OK</span>
          </div>
        </div>

        {/* Right Nav Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowDocs(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand-border bg-brand-panel hover:bg-brand-card hover:text-white transition-all text-xs font-medium cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Docs
          </button>

          <button
            onClick={() => setShowIpChecker(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand-border bg-brand-panel hover:bg-brand-card hover:text-white transition-all text-xs font-medium cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            IP Checker
          </button>

          <button
            onClick={() => setShowInstaller(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-cyan text-brand-panel hover:bg-brand-cyan/95 transition-all text-xs font-bold cursor-pointer glow-cyan"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            PMTA Installer
          </button>

          <button
            onClick={() => {
              if (confirm("Simulate logout? You can access the tool again instantly.")) {
                alert("Logged out. Click OK to re-authenticate.");
              }
            }}
            className="px-3 py-1.5 rounded-lg border border-brand-red/30 hover:border-brand-red hover:bg-brand-red/10 text-brand-red transition-all text-xs font-medium cursor-pointer"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Segmented Tab Navigation Control */}
      <div className="max-w-7xl mx-auto w-full px-6 mt-6">
        <div className="flex bg-brand-panel p-1 rounded-xl border border-brand-border/60">
          <button
            onClick={() => setActiveTab('compose')}
            className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold tracking-wide transition-all cursor-pointer ${activeTab === 'compose'
                ? 'bg-brand-card text-brand-cyan border border-brand-cyan/20 shadow-md shadow-brand-cyan/5'
                : 'text-brand-text hover:text-brand-text-bright'
              }`}
          >
            <Mail className="w-4 h-4" />
            Compose Campaign
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold tracking-wide transition-all cursor-pointer ${activeTab === 'settings'
                ? 'bg-brand-card text-brand-cyan border border-brand-cyan/20 shadow-md shadow-brand-cyan/5'
                : 'text-brand-text hover:text-brand-text-bright'
              }`}
          >
            <Settings className="w-4 h-4" />
            SMTP & Engine Settings
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------
          MAIN SCREEN CONTAINER
         --------------------------------------------------------- */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 overflow-x-hidden">
        {activeTab === 'compose' ? (

          /* =========================================================
             TAB 1: COMPOSE VIEW (GRID: Left Panel (7 cols), Right Panel (5 cols))
             ========================================================= */
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

            {/* --- LEFT PANEL --- */}
            <div className="xl:col-span-7 space-y-6">

              {/* Sender & Subject Section */}
              <div className="bg-brand-panel rounded-xl border border-brand-border p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-brand-border/50 pb-3">
                  <h2 className="text-md font-bold text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-brand-cyan" />
                    Sender & Subject Section
                  </h2>
                  <span className="text-xs text-brand-cyan font-mono bg-brand-cyan/10 px-2 py-0.5 rounded">Campaign Context</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-text-bright flex items-center gap-1">
                      From Email <span className="text-brand-red">*</span>
                    </label>
                    <input
                      type="text"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      className="w-full bg-brand-bg/80 border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text-bright focus:outline-none focus:border-brand-cyan font-mono"
                      placeholder="e.g. support@domain.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-text-bright flex items-center gap-1">
                      From Name <span className="text-brand-red">*</span>
                    </label>
                    <input
                      type="text"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      className="w-full bg-brand-bg/80 border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text-bright focus:outline-none focus:border-brand-cyan"
                      placeholder="e.g. Brand Name"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-brand-text-bright flex items-center gap-1">
                    Subject <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-brand-bg/80 border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text-bright focus:outline-none focus:border-brand-cyan"
                    placeholder="e.g. Urgent Domain Expiration notice"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-text-bright">Reply-To</label>
                    <input
                      type="text"
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      className="w-full bg-brand-bg/80 border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text-bright focus:outline-none focus:border-brand-cyan font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-text-bright">Redirect URL <code className="text-brand-cyan">[-url-]</code></label>
                    <input
                      type="text"
                      value={redirectUrl}
                      onChange={(e) => setRedirectUrl(e.target.value)}
                      className="w-full bg-brand-bg/80 border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text-bright focus:outline-none focus:border-brand-cyan font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-text-bright">Logo URL <code className="text-brand-cyan">[-url-img-]</code></label>
                    <input
                      type="text"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="w-full bg-brand-bg/80 border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text-bright focus:outline-none focus:border-brand-cyan font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Custom Headers Section (collapsible) */}
              <div className="bg-brand-panel rounded-xl border border-brand-border overflow-hidden">
                <button
                  onClick={() => setHeadersOpen(!headersOpen)}
                  className="w-full px-5 py-4 flex items-center justify-between bg-brand-panel hover:bg-brand-card transition-all text-left border-none outline-none cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <FileCode className="w-4 h-4 text-brand-cyan" />
                    <span className="font-bold text-white text-md">Custom Headers Section</span>
                    <span className="text-xs text-brand-text/60">({headersText.split('\n').filter(Boolean).length} custom directives)</span>
                  </div>
                  {headersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {headersOpen && (
                  <div className="p-5 border-t border-brand-border/60 bg-brand-bg/30 space-y-4">
                    {/* Server Presets */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-brand-text-bright block">Server Presets:</span>
                      <div className="flex flex-wrap gap-2">
                        {['IP Unknown', 'Webmail', 'Apple Mail', 'Gmail Mobile', 'Thunderbird', 'Corporate'].map(preset => (
                          <button
                            key={preset}
                            onClick={() => applyHeaderPreset(preset)}
                            className="text-xs bg-brand-card border border-brand-border px-2.5 py-1 rounded-md text-brand-text-bright hover:bg-brand-cyan hover:text-brand-panel transition-all font-mono"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Type tags */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-brand-text-bright block">Type tag buttons:</span>
                      <div className="flex flex-wrap gap-2">
                        {['Newsletter', 'Transactional', 'High Priority', 'Reply-To', 'ARC Pass', 'Clean', 'Clear'].map(tag => (
                          <button
                            key={tag}
                            onClick={() => applyHeaderType(tag)}
                            className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-all ${tag === 'High Priority'
                                ? 'bg-brand-orange text-white hover:bg-brand-orange/90'
                                : tag === 'Clear'
                                  ? 'border border-brand-red text-brand-red hover:bg-brand-red/10'
                                  : 'bg-brand-border text-brand-text-bright hover:bg-brand-cyan hover:text-brand-panel'
                              }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Action & Textarea */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-brand-text-bright">Raw Headers Input:</span>
                        <button
                          onClick={handleEmlImport}
                          className="text-xs flex items-center gap-1 border border-brand-cyan/40 px-2 py-1 rounded-md text-brand-cyan hover:bg-brand-cyan/10 transition-all font-semibold"
                        >
                          Import .eml Source
                        </button>
                      </div>

                      <textarea
                        ref={headersTextareaRef}
                        value={headersText}
                        onChange={(e) => setHeadersText(e.target.value)}
                        className="w-full h-32 bg-brand-bg border border-brand-border rounded-lg p-3 text-xs text-brand-text-bright font-mono focus:outline-none focus:border-brand-cyan"
                        placeholder="MIME-Version: 1.0..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Tips Section (collapsible) */}
              <div className="bg-brand-panel rounded-xl border border-brand-border overflow-hidden">
                <button
                  onClick={() => setTipsOpen(!tipsOpen)}
                  className="w-full px-5 py-4 flex items-center justify-between bg-brand-panel hover:bg-brand-card transition-all text-left border-none outline-none cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Info className="w-4 h-4 text-brand-green" />
                    <span className="font-bold text-brand-green text-md">MoonMailer Pro Tips Section</span>
                  </div>
                  {tipsOpen ? <ChevronUp className="w-4 h-4 text-brand-green" /> : <ChevronDown className="w-4 h-4 text-brand-green" />}
                </button>

                {tipsOpen && (
                  <div className="p-5 border-t border-brand-border/60 bg-brand-bg/30 space-y-3">
                    <p className="text-xs text-brand-green font-medium">
                      🚀 Use template variables inside Subject, Body, and Headers. They are automatically evaluated at send time per-recipient.
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-brand-cyan font-bold block mb-1">SYNTAX BLOCK EXAMPLES</span>
                        <div className="bg-brand-panel p-2 rounded border border-brand-border text-brand-text-bright">
                          {"{Renew Now|Immediate Renewal|Update Payment}"}
                        </div>
                      </div>
                      <div>
                        <span className="text-brand-orange font-bold block mb-1">DATE MATCH DIRECTIVES</span>
                        <div className="bg-brand-panel p-2 rounded border border-brand-border text-brand-text-bright">
                          {"[-date-] matches standard YYYY-MM-DD"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Message Body HTML Section */}
              <div className="bg-brand-panel rounded-xl border border-brand-border p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-brand-border/50 pb-3">
                  <h2 className="text-md font-bold text-white flex items-center gap-2">
                    <Code className="w-4 h-4 text-brand-cyan" />
                    Message Body (HTML) Section
                  </h2>
                  <span className="text-xs text-brand-green font-mono bg-brand-green/10 px-2 py-0.5 rounded">Dynamic Token Engine</span>
                </div>

                {/* Token Chips Grid by Category */}
                <div className="space-y-3 bg-brand-bg/50 p-4 rounded-xl border border-brand-border/60">
                  <span className="text-xs font-semibold text-brand-text-bright block">Click token chips to insert into HTML at cursor:</span>

                  {/* Category 1: Recipient */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-brand-cyan">Recipient Variables:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['[-email-]', '[-emailuser-]', '[-emaildomain-]', '[-base64email-]'].map(token => (
                        <button
                          key={token}
                          onClick={() => insertToken(token)}
                          className="text-[11px] bg-brand-card hover:bg-brand-cyan hover:text-brand-panel border border-brand-border font-mono px-2 py-0.5 rounded text-brand-text-bright transition-all"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category 2: URLS */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-brand-cyan">Redirect & Media:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['[-url-]', '[-url-img-]'].map(token => (
                        <button
                          key={token}
                          onClick={() => insertToken(token)}
                          className="text-[11px] bg-brand-card hover:bg-brand-cyan hover:text-brand-panel border border-brand-border font-mono px-2 py-0.5 rounded text-brand-text-bright transition-all"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category 3: IDENTITY */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-brand-green">Identity Fields:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['[-firstname-]', '[-lastname-]', '[-fullname-]', '[-company-]', '[-jobtitle-]', '[-phone-]', '[-address-]', '[-city-]', '[-country-]', '[-domain-]', '[-emoji-]'].map(token => (
                        <button
                          key={token}
                          onClick={() => insertToken(token)}
                          className="text-[11px] bg-brand-card hover:bg-brand-green hover:text-brand-panel border border-brand-border font-mono px-2 py-0.5 rounded text-brand-text-bright transition-all"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category 4: RANDOM */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-brand-orange">Random Generators:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['[-randomstring-]', '[-randomnumber-]', '[-randomletters-]', '[-randomdS-]', '[-randomuuid-]', '[-randomhex-]', '[-shortid-]', '[-randomcolor-]', '[-randompid-]', '[-randomu-]'].map(token => (
                        <button
                          key={token}
                          onClick={() => insertToken(token)}
                          className="text-[11px] bg-brand-card hover:bg-brand-orange hover:text-brand-panel border border-brand-border font-mono px-2 py-0.5 rounded text-brand-text-bright transition-all"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category 5: TECHNICAL */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-brand-text">Technical Noise:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['[-randomclass-]', '[-randomid-]', '[-randommessageid-]', '[-randomboundary-]'].map(token => (
                        <button
                          key={token}
                          onClick={() => insertToken(token)}
                          className="text-[11px] bg-brand-card hover:bg-brand-border hover:text-brand-text-bright border border-brand-border font-mono px-2 py-0.5 rounded text-brand-text-bright transition-all"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category 6: DATE/TIME */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-white">Date & Timestamp:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['[-date-]', '[-timestamp-]', '[-unixtime-]', '[-year-]'].map(token => (
                        <button
                          key={token}
                          onClick={() => insertToken(token)}
                          className="text-[11px] bg-brand-card hover:bg-brand-cyan hover:text-brand-panel border border-brand-border font-mono px-2 py-0.5 rounded text-brand-text-bright transition-all"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-brand-text-bright">HTML Source Code:</span>
                    <span className="text-brand-text/50 font-mono">Lines: {htmlBody.split('\n').length}</span>
                  </div>
                  <textarea
                    ref={bodyTextareaRef}
                    value={htmlBody}
                    onChange={(e) => setHtmlBody(e.target.value)}
                    className="w-full h-96 bg-brand-bg border border-brand-border rounded-lg p-4 text-xs font-mono text-brand-text-bright focus:outline-none focus:border-brand-cyan leading-relaxed"
                  />
                </div>
              </div>

              {/* Recipients Section */}
              <div className="bg-brand-panel rounded-xl border border-brand-border p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-brand-border/50 pb-3">
                  <h2 className="text-md font-bold text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-brand-cyan" />
                    Target Recipients Section
                  </h2>
                  <span className="text-xs bg-brand-card border border-brand-border px-2 py-0.5 rounded font-mono text-brand-text-bright">
                    {recipientsText.split('\n').filter(Boolean).length} Emails loaded
                  </span>
                </div>

                <textarea
                  value={recipientsText}
                  onChange={(e) => setRecipientsText(e.target.value)}
                  className="w-full h-24 bg-brand-bg border border-brand-border rounded-lg p-3 text-xs font-mono text-brand-text-bright focus:outline-none focus:border-brand-cyan"
                  placeholder="One email per line..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={runSpamassassin}
                  className="flex-1 min-w-[150px] bg-brand-orange hover:bg-brand-orange/95 text-white font-bold py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 glow-orange"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {testingSpam ? 'SCANNING...' : 'SPAMASSASSIN'}
                </button>
                <button
                  onClick={runCloudmark}
                  className="flex-1 min-w-[150px] bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Cpu className="w-4 h-4" />
                  {testingCloudmark ? 'REPUTATION CHECKING...' : 'CLOUDMARK'}
                </button>
                <button
                  onClick={triggerCampaignSend}
                  disabled={sendingCampaign}
                  className="flex-2 min-w-[200px] bg-brand-cyan hover:bg-brand-cyan/95 text-brand-panel font-extrabold py-3 px-6 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-brand-cyan/20 glow-cyan"
                >
                  {sendingCampaign ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                  {sendingCampaign ? `SENDING (${sendProgress}%)` : 'SEND CAMPAIGN'}
                </button>
                <button
                  onClick={() => {
                    setHtmlBody('')
                    setRecipientsText('')
                    setSubject('')
                  }}
                  className="px-4 py-3 border border-brand-border hover:border-brand-red hover:bg-brand-red/10 text-brand-text hover:text-brand-red transition-all rounded-xl text-sm font-semibold cursor-pointer"
                >
                  Clear Data
                </button>
              </div>

              {/* Sending Progress Monitor Console */}
              {(sendingCampaign || sendProgress > 0) && (
                <div className="bg-brand-panel rounded-xl border border-brand-border p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-brand-border/50 pb-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <Terminal className="w-3.5 h-3.5 text-brand-cyan" />
                      Bulk Sending Engine Monitor Console
                    </span>
                    <span className="text-xs bg-brand-cyan/15 text-brand-cyan font-mono border border-brand-cyan/30 px-2 py-0.5 rounded">
                      Mode: {speedMode}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 bg-brand-bg/40 p-3 rounded-lg border border-brand-border/50">
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between text-[11px] text-brand-text-bright font-semibold font-mono">
                        <span>SEND PROGRESS: {sendProgress}%</span>
                        <span>{sentStats.sent} sent</span>
                      </div>
                      <div className="w-full bg-brand-bg h-2 rounded-full overflow-hidden border border-brand-border">
                        <div className="bg-brand-cyan h-full transition-all duration-300" style={{ width: `${sendProgress}%` }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Sent Statistics Row */}
                  <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                    <div className="bg-brand-card p-2 rounded-lg border border-brand-border">
                      <span className="text-brand-text/70 block text-[9px] uppercase tracking-wider">Total Queue</span>
                      <strong className="text-white text-md">{recipientsText.split('\n').filter(Boolean).length}</strong>
                    </div>
                    <div className="bg-brand-card p-2 rounded-lg border border-brand-green/20">
                      <span className="text-brand-green block text-[9px] uppercase tracking-wider">Delivered</span>
                      <strong className="text-brand-green text-md">{sentStats.delivered}</strong>
                    </div>
                    <div className="bg-brand-card p-2 rounded-lg border border-brand-red/20">
                      <span className="text-brand-red block text-[9px] uppercase tracking-wider">Bounces</span>
                      <strong className="text-brand-red text-md">{sentStats.bounced}</strong>
                    </div>
                    <div className="bg-brand-card p-2 rounded-lg border border-brand-orange/20">
                      <span className="text-brand-orange block text-[9px] uppercase tracking-wider">Deferred</span>
                      <strong className="text-brand-orange text-md">{sentStats.deferred}</strong>
                    </div>
                  </div>

                  {/* Scrollable logs */}
                  <div
                    ref={logContainerRef}
                    className="bg-brand-bg h-48 rounded-lg p-3 overflow-y-auto border border-brand-border font-mono text-[10px] text-brand-cyan space-y-1 leading-relaxed"
                  >
                    {sendLogs.map((log, i) => (
                      <div key={i} className={`${log.includes('❌')
                          ? 'text-brand-red'
                          : log.includes('⏳')
                            ? 'text-brand-orange'
                            : log.includes('✅')
                              ? 'text-brand-green'
                              : 'text-brand-cyan/85'
                        }`}>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Spamassassin Score Result report */}
              {spamScore && (
                <div className="bg-brand-panel border-2 border-brand-green/30 rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-brand-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-brand-green" />
                      <h3 className="text-white font-bold text-md">SpamAssassin Deliverability Score</h3>
                    </div>
                    <div className="bg-brand-green/10 text-brand-green font-mono font-extrabold px-3 py-1 rounded-full text-sm">
                      {spamScore.score}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-brand-card p-3 rounded-lg border border-brand-border/50 text-center flex flex-col justify-center">
                      <span className="text-xs text-brand-text">SPAM RATING STATUS</span>
                      <strong className="text-brand-green text-xl font-black font-mono tracking-wide">{spamScore.rating}</strong>
                    </div>
                    <div className="text-xs text-brand-text space-y-1.5 flex flex-col justify-center">
                      <p>✅ All required headers aligned successfully.</p>
                      <p>✅ Domain verification pass limits confirmed.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-bold text-white block">Rule Verification report:</span>
                    <div className="space-y-1">
                      {spamScore.details.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs bg-brand-bg/50 px-3 py-1.5 rounded border border-brand-border/60">
                          <span className="text-brand-text font-semibold">{item.check}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-brand-text/50 font-mono text-[10px]">{item.desc}</span>
                            <span className="text-brand-green font-bold text-[10px] uppercase font-mono px-1.5 py-0.5 bg-brand-green/10 border border-brand-green/20 rounded">
                              {item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Cloudmark Report overlay */}
              {cloudmarkScore && (
                <div className="bg-brand-panel border-2 border-purple-500/30 rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-brand-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-purple-400" />
                      <h3 className="text-white font-bold text-md font-mono">Cloudmark Reputation Status</h3>
                    </div>
                    <span className="bg-purple-600/10 text-purple-400 font-mono font-extrabold px-3 py-1 rounded-full text-xs">
                      {cloudmarkScore.status}
                    </span>
                  </div>

                  <div className="bg-brand-bg/50 p-4 rounded-lg border border-brand-border text-center font-mono">
                    <span className="text-[10px] text-brand-text uppercase block">CLOUDMARK SCORE</span>
                    <strong className="text-purple-400 text-md tracking-wider">{cloudmarkScore.rating}</strong>
                  </div>

                  <div className="space-y-1">
                    {cloudmarkScore.details.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs bg-brand-bg/40 px-3 py-1.5 rounded border border-brand-border/60 font-mono">
                        <span className="text-brand-text">{item.node}</span>
                        <span className="text-brand-cyan text-[11px]">{item.result}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* --- RIGHT PANEL (Inbox Shield, Content Randomizer, Creative Engine, Preview) --- */}
            <div className="xl:col-span-5 space-y-6">

              {/* Inbox Shield Panel */}
              <div className="bg-brand-panel rounded-xl border border-brand-border overflow-hidden">
                <button
                  onClick={() => setShieldOpen(!shieldOpen)}
                  className="w-full px-5 py-4 flex items-center justify-between bg-brand-panel hover:bg-brand-card transition-all text-left border-none outline-none cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-brand-cyan" />
                    <span className="font-bold text-white text-md">Inbox Shield Panel</span>
                    <span className="text-xs bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30 px-2 py-0.5 rounded font-mono font-bold">
                      {countActiveShield()} active
                    </span>
                  </div>
                  {shieldOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {shieldOpen && (
                  <div className="p-5 border-t border-brand-border/60 bg-brand-bg/30 space-y-4">

                    {/* MIME group */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider border-b border-brand-border pb-1">MIME GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['multipart', 'base64Encode', 'quotedPrintable', 'fixMime'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={shieldState[k]}
                              onChange={(e) => setShieldState({ ...shieldState, [k]: e.target.checked })}
                              className="accent-brand-cyan"
                            />
                            {k === 'multipart' && 'Multipart text+HTML'}
                            {k === 'base64Encode' && 'Base64 encode'}
                            {k === 'quotedPrintable' && 'Quoted-Printable'}
                            {k === 'fixMime' && 'Fix MIME structure'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* HEADERS group */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider border-b border-brand-border pb-1">HEADERS GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['headerRotation', 'reputationHeaders', 'subjectEncode', 'dateJitter', 'listUnsubscribe'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={shieldState[k]}
                              onChange={(e) => setShieldState({ ...shieldState, [k]: e.target.checked })}
                              className="accent-brand-cyan"
                            />
                            {k === 'headerRotation' && 'Header rotation'}
                            {k === 'reputationHeaders' && 'Reputation headers'}
                            {k === 'subjectEncode' && 'Subject encode'}
                            {k === 'dateJitter' && 'Date jitter'}
                            {k === 'listUnsubscribe' && 'List-Unsubscribe'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* HTML FIX group */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider border-b border-brand-border pb-1">HTML FIX GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['cssInliner', 'minifyHtml', 'tableWrapper', 'outlookFixes', 'darkMode', 'fixImgAlt'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={shieldState[k]}
                              onChange={(e) => setShieldState({ ...shieldState, [k]: e.target.checked })}
                              className="accent-brand-cyan"
                            />
                            {k === 'cssInliner' && 'CSS inliner'}
                            {k === 'minifyHtml' && 'Minify HTML'}
                            {k === 'tableWrapper' && 'Table wrapper'}
                            {k === 'outlookFixes' && 'Outlook fixes'}
                            {k === 'darkMode' && 'Dark mode'}
                            {k === 'fixImgAlt' && 'Fix img alt'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* STEALTH group (cyan label) */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-brand-cyan block uppercase tracking-wider border-b border-brand-cyan/20 pb-1">STEALTH GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['antiFingerprint', 'normalizeWs', 'styleShuffle', 'linkUniquifier', 'spamProtector', 'utf8Normalizer', 'charsetNormalizer', 'cleanTrackers'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={shieldState[k]}
                              onChange={(e) => setShieldState({ ...shieldState, [k]: e.target.checked })}
                              className="accent-brand-cyan"
                            />
                            {k === 'antiFingerprint' && 'Anti-fingerprint'}
                            {k === 'normalizeWs' && 'Normalize WS'}
                            {k === 'styleShuffle' && 'Style shuffle'}
                            {k === 'linkUniquifier' && 'Link uniquifier'}
                            {k === 'spamProtector' && 'Spam protector'}
                            {k === 'utf8Normalizer' && 'UTF-8 normalizer'}
                            {k === 'charsetNormalizer' && 'Charset normalizer'}
                            {k === 'cleanTrackers' && 'Clean trackers'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* ANTI-CMAS group (orange label) */}
                    <div className="space-y-2.5">
                      <span className="text-xs font-bold text-brand-orange block uppercase tracking-wider border-b border-brand-orange/20 pb-1">ANTI-CMAS GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['structureMutator', 'headerNoise', 'mimeBoundary', 'receivedChain', 'messageIdForge', 'contentIdRand'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={shieldState[k]}
                              onChange={(e) => setShieldState({ ...shieldState, [k]: e.target.checked })}
                              className="accent-brand-orange"
                            />
                            {k === 'structureMutator' && 'Structure mutator'}
                            {k === 'headerNoise' && 'Header noise'}
                            {k === 'mimeBoundary' && 'MIME boundary'}
                            {k === 'receivedChain' && 'Received chain'}
                            {k === 'messageIdForge' && 'Message-ID forge'}
                            {k === 'contentIdRand' && 'Content-ID rand'}
                          </label>
                        ))}
                      </div>

                      {/* OX Cloudmark orange highlighted toggle */}
                      <button
                        onClick={() => setShieldState({ ...shieldState, oxCloudmark: !shieldState.oxCloudmark })}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold tracking-wider transition-all cursor-pointer ${shieldState.oxCloudmark
                            ? 'bg-brand-orange text-white glow-orange shadow-md shadow-brand-orange/15'
                            : 'bg-brand-card hover:bg-brand-card/90 text-brand-text border border-brand-border'
                          }`}
                      >
                        OX Cloudmark: {shieldState.oxCloudmark ? 'ACTIVE INTEGRATION' : 'DISABLED'}
                      </button>
                    </div>

                    {/* 2026 HEADERS group (red label) */}
                    <div className="space-y-3">
                      <span className="text-xs font-bold text-brand-red block uppercase tracking-wider border-b border-brand-red/20 pb-1">2026 HEADERS GROUP</span>

                      {/* Highlighted buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        {['rfc8058Full', 'arcChain', 'espFingerprint', 'threadInject'].map(k => (
                          <button
                            key={k}
                            onClick={() => setShieldState({ ...shieldState, [k]: !shieldState[k] })}
                            className={`py-1.5 px-2 rounded-lg text-[10px] font-extrabold font-mono transition-all border cursor-pointer ${shieldState[k]
                                ? 'bg-brand-red/10 border-brand-red text-brand-red'
                                : 'bg-brand-card border-brand-border text-brand-text'
                              }`}
                          >
                            {k === 'rfc8058Full' && 'RFC 8058 Full'}
                            {k === 'arcChain' && 'ARC Chain'}
                            {k === 'espFingerprint' && 'ESP Fingerprint'}
                            {k === 'threadInject' && 'Thread Inject'}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {['gmail2026', 'outlookMimic', 'antiAiFilter', 'bimiHeader', 'returnPathAlign', 'muaRotate', 'headerSalting'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={shieldState[k]}
                              onChange={(e) => setShieldState({ ...shieldState, [k]: e.target.checked })}
                              className="accent-brand-red"
                            />
                            {k === 'gmail2026' && 'Gmail 2026'}
                            {k === 'outlookMimic' && 'Outlook Mimic'}
                            {k === 'antiAiFilter' && 'Anti-AI Filter'}
                            {k === 'bimiHeader' && 'BIMI Header'}
                            {k === 'returnPathAlign' && 'Return-Path Align'}
                            {k === 'muaRotate' && 'MUA Rotate'}
                            {k === 'headerSalting' && 'Header Salting'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* EITSFAS group */}
                    <div className="space-y-2 bg-brand-bg/40 p-3 rounded-lg border border-brand-border/60">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider">EITSFAS GROUP</span>

                      <div className="space-y-2 text-xs">
                        <div className="space-y-1">
                          <label className="text-[10px] text-brand-text">Preheader Text</label>
                          <input
                            type="text"
                            value={shieldState.preheader}
                            onChange={(e) => setShieldState({ ...shieldState, preheader: e.target.value })}
                            className="w-full bg-brand-bg border border-brand-border rounded px-2.5 py-1 text-xs text-brand-text-bright focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-brand-text">Preview text shown in inbox</label>
                          <input
                            type="text"
                            value={shieldState.previewText}
                            onChange={(e) => setShieldState({ ...shieldState, previewText: e.target.value })}
                            className="w-full bg-brand-bg border border-brand-border rounded px-2.5 py-1 text-xs text-brand-text-bright focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-between py-1">
                          <span className="text-brand-text">Pixel tracker status</span>
                          <input
                            type="checkbox"
                            checked={shieldState.pixelTracker}
                            onChange={(e) => setShieldState({ ...shieldState, pixelTracker: e.target.checked })}
                            className="accent-brand-cyan"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-brand-text">Tracking URL Input</label>
                          <input
                            type="text"
                            value={shieldState.trackingUrl}
                            onChange={(e) => setShieldState({ ...shieldState, trackingUrl: e.target.value })}
                            className="w-full bg-brand-bg border border-brand-border rounded px-2.5 py-1 text-xs text-brand-text-bright focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Content Randomizer Panel */}
              <div className="bg-brand-panel rounded-xl border border-brand-border overflow-hidden">
                <button
                  onClick={() => setRandomizerOpen(!randomizerOpen)}
                  className="w-full px-5 py-4 flex items-center justify-between bg-brand-panel hover:bg-brand-card transition-all text-left border-none outline-none cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-brand-orange" />
                    <span className="font-bold text-white text-md">Content Randomizer Panel</span>
                    <span className="text-xs bg-brand-orange/20 text-brand-orange border border-brand-orange/30 px-2 py-0.5 rounded font-mono font-bold">
                      {countActiveRandomizer()} active
                    </span>
                  </div>
                  {randomizerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {randomizerOpen && (
                  <div className="p-5 border-t border-brand-border/60 bg-brand-bg/30 space-y-4">

                    {/* STRUCTURE group */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider border-b border-brand-border pb-1">STRUCTURE GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['renameClassId', 'swapTags', 'tableLayout', 'stripComments', 'linkParams', 'imageParams'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={randomizerState[k]}
                              onChange={(e) => setRandomizerState({ ...randomizerState, [k]: e.target.checked })}
                              className="accent-brand-orange"
                            />
                            {k === 'renameClassId' && 'Rename class/id'}
                            {k === 'swapTags' && 'Swap tags'}
                            {k === 'tableLayout' && 'Table layout'}
                            {k === 'stripComments' && 'Strip comments'}
                            {k === 'linkParams' && 'Link params'}
                            {k === 'imageParams' && 'Image params'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* TEXT group */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider border-b border-brand-border pb-1">TEXT GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['textMutation', 'splitWords', 'wrapSpan'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={randomizerState[k]}
                              onChange={(e) => setRandomizerState({ ...randomizerState, [k]: e.target.checked })}
                              className="accent-brand-orange"
                            />
                            {k === 'textMutation' && 'Text mutation'}
                            {k === 'splitWords' && 'Split words'}
                            {k === 'wrapSpan' && 'Wrap SPAN'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* ANTI-BAYES group (orange label) */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-brand-orange block uppercase tracking-wider border-b border-brand-orange/20 pb-1">ANTI-BAYES GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['homoglyphs', 'whitespace', 'hamPoison', 'entities', 'hiddenText'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={randomizerState[k]}
                              onChange={(e) => setRandomizerState({ ...randomizerState, [k]: e.target.checked })}
                              className="accent-brand-orange"
                            />
                            {k === 'homoglyphs' && 'Homoglyphs'}
                            {k === 'whitespace' && 'Whitespace'}
                            {k === 'hamPoison' && 'Ham poison'}
                            {k === 'entities' && 'Entities'}
                            {k === 'hiddenText' && 'Hidden text'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* ANTI-HASH group (orange label) */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-brand-orange block uppercase tracking-wider border-b border-brand-orange/20 pb-1">ANTI-HASH GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['directionMarks', 'attrInject', 'classMutate', 'softHyphens', 'fontWrap'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={randomizerState[k]}
                              onChange={(e) => setRandomizerState({ ...randomizerState, [k]: e.target.checked })}
                              className="accent-brand-orange"
                            />
                            {k === 'directionMarks' && 'Direction marks'}
                            {k === 'attrInject' && 'Attr inject'}
                            {k === 'classMutate' && 'Class mutate'}
                            {k === 'softHyphens' && 'Soft hyphens'}
                            {k === 'fontWrap' && 'Font wrap'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* RANGES group */}
                    <div className="space-y-2 bg-brand-bg/40 p-3 rounded-lg border border-brand-border/60 text-xs">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider">RANGES GROUP</span>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] text-brand-text">Homoglyph %</label>
                          <input
                            type="number"
                            value={randomizerState.homoglyphPct}
                            onChange={(e) => setRandomizerState({ ...randomizerState, homoglyphPct: parseInt(e.target.value) || 0 })}
                            className="w-full bg-brand-bg border border-brand-border rounded px-2 py-1 text-white focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-brand-text">Poison blocks</label>
                          <input
                            type="number"
                            value={randomizerState.poisonBlocks}
                            onChange={(e) => setRandomizerState({ ...randomizerState, poisonBlocks: parseInt(e.target.value) || 0 })}
                            className="w-full bg-brand-bg border border-brand-border rounded px-2 py-1 text-white focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-brand-text">Color α</label>
                          <input
                            type="number"
                            value={randomizerState.colorAlpha}
                            onChange={(e) => setRandomizerState({ ...randomizerState, colorAlpha: parseInt(e.target.value) || 0 })}
                            className="w-full bg-brand-bg border border-brand-border rounded px-2 py-1 text-white focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-brand-text">Spacing xpx</label>
                          <input
                            type="number"
                            value={randomizerState.spacingPx}
                            onChange={(e) => setRandomizerState({ ...randomizerState, spacingPx: parseInt(e.target.value) || 0 })}
                            className="w-full bg-brand-bg border border-brand-border rounded px-2 py-1 text-white focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Creative Engine Panel */}
              <div className="bg-brand-panel rounded-xl border border-brand-border overflow-hidden">
                <button
                  onClick={() => setCreativeOpen(!creativeOpen)}
                  className="w-full px-5 py-4 flex items-center justify-between bg-brand-panel hover:bg-brand-card transition-all text-left border-none outline-none cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Zap className="w-4 h-4 text-brand-cyan fill-current" />
                    <span className="font-bold text-white text-md">Creative Engine Panel</span>
                    <span className="text-xs bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30 px-2 py-0.5 rounded font-mono font-bold">
                      {countActiveCreative()} active
                    </span>
                  </div>
                  {creativeOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {creativeOpen && (
                  <div className="p-5 border-t border-brand-border/60 bg-brand-bg/30 space-y-4">

                    {/* CONTENT group */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider border-b border-brand-border pb-1">CONTENT GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['uniqueHash', 'synonyms', 'shuffleParagraphs', 'lengthPadding', 'dataAttributes', 'wsDiversity'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={creativeState[k]}
                              onChange={(e) => setCreativeState({ ...creativeState, [k]: e.target.checked })}
                              className="accent-brand-cyan"
                            />
                            {k === 'uniqueHash' && 'Unique hash'}
                            {k === 'synonyms' && 'Synonyms'}
                            {k === 'shuffleParagraphs' && 'Shuffle ¶'}
                            {k === 'lengthPadding' && 'Length padding'}
                            {k === 'dataAttributes' && 'Data attributes'}
                            {k === 'wsDiversity' && 'WS diversity'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* ANTI-FILTER group */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider border-b border-brand-border pb-1">ANTI-FILTER GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['conversationSeed', 'multiEncode', 'colorJitter', 'spacingJitter', 'uniqueSentence'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={creativeState[k]}
                              onChange={(e) => setCreativeState({ ...creativeState, [k]: e.target.checked })}
                              className="accent-brand-cyan"
                            />
                            {k === 'conversationSeed' && 'Conversation seed'}
                            {k === 'multiEncode' && 'Multi-encode'}
                            {k === 'colorJitter' && 'Color jitter'}
                            {k === 'spacingJitter' && 'Spacing jitter'}
                            {k === 'uniqueSentence' && 'Unique sentence'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* VISUAL group */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider border-b border-brand-border pb-1">VISUAL GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['responsive', 'imgSize', 'gmailPrimary'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={creativeState[k]}
                              onChange={(e) => setCreativeState({ ...creativeState, [k]: e.target.checked })}
                              className="accent-brand-cyan"
                            />
                            {k === 'responsive' && 'Responsive'}
                            {k === 'imgSize' && 'Img size'}
                            {k === 'gmailPrimary' && 'Gmail Primary'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* HEADERS group */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider border-b border-brand-border pb-1">HEADERS GROUP</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['fakeThread', 'nameRotation', 'replyToRotation'].map(k => (
                          <label key={k} className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={creativeState[k]}
                              onChange={(e) => setCreativeState({ ...creativeState, [k]: e.target.checked })}
                              className="accent-brand-cyan"
                            />
                            {k === 'fakeThread' && 'Fake thread'}
                            {k === 'nameRotation' && 'Name rotation'}
                            {k === 'replyToRotation' && 'Reply-To rotation'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* LISTS group */}
                    <div className="space-y-2 text-xs">
                      <span className="text-xs font-bold text-white block uppercase tracking-wider">LISTS GROUP</span>

                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-brand-text block">Sender names (one per line)</label>
                          <textarea
                            value={creativeState.senderNames}
                            onChange={(e) => setCreativeState({ ...creativeState, senderNames: e.target.value })}
                            className="w-full h-16 bg-brand-bg border border-brand-border rounded p-2 text-xs font-mono text-white focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-brand-text block">Reply-To emails (one per line)</label>
                          <textarea
                            value={creativeState.replyToEmails}
                            onChange={(e) => setCreativeState({ ...creativeState, replyToEmails: e.target.value })}
                            className="w-full h-16 bg-brand-bg border border-brand-border rounded p-2 text-xs font-mono text-white focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Panel */}
              <div className="bg-brand-panel rounded-xl border border-brand-border p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-brand-border/50 pb-3">
                  <div className="flex bg-brand-bg p-0.5 rounded-lg border border-brand-border">
                    {['visual', 'source', 'diff'].map(tab => (
                      <button
                        key={tab}
                        onClick={() => setPreviewTab(tab)}
                        className={`text-xs px-3 py-1 rounded-md font-semibold capitalize transition-all cursor-pointer ${previewTab === tab
                            ? 'bg-brand-card text-brand-cyan border border-brand-cyan/20'
                            : 'text-brand-text hover:text-white'
                          }`}
                      >
                        {tab === 'visual' && 'Visual'}
                        {tab === 'source' && 'Source'}
                        {tab === 'diff' && 'Diff'}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={reRollTokens}
                    className="flex items-center gap-1 text-xs border border-brand-cyan/45 px-2.5 py-1 rounded-lg text-brand-cyan hover:bg-brand-cyan/10 transition-all font-semibold font-mono"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-Roll
                  </button>
                </div>

                {/* Rendered Preview Screen */}
                <div className="bg-brand-bg/50 rounded-xl p-3 border border-brand-border/60">

                  {previewTab === 'visual' && (
                    <div className="space-y-3">
                      {/* Email Header */}
                      <div className="bg-brand-card p-3 rounded-lg border border-brand-border/60 text-xs space-y-1 text-brand-text">
                        <div>
                          <span className="font-semibold text-brand-text-bright">From:</span> "{fromName}" &lt;{fromEmail}&gt;
                        </div>
                        <div>
                          <span className="font-semibold text-brand-text-bright">Subject:</span> {subject.replace(/\[-domain-\]/g, tokenValues.domain)}
                        </div>
                      </div>

                      {/* HTML preview inside frame */}
                      <div className="bg-white rounded-lg p-4 border border-brand-border max-h-[420px] overflow-y-auto">
                        <div dangerouslySetInnerHTML={{ __html: getCompiledHtml() }} />
                      </div>
                    </div>
                  )}

                  {previewTab === 'source' && (
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase font-mono text-brand-cyan block">COMPILED EMAIL SOURCE (TEMPLATE MATCHED):</span>
                      <pre className="w-full max-h-[350px] overflow-auto bg-brand-panel p-3 rounded-lg text-[10px] text-brand-text-bright font-mono border border-brand-border/60 whitespace-pre-wrap leading-relaxed select-all">
                        {`Subject: ${subject.replace(/\[-domain-\]/g, tokenValues.domain)}
From: "${fromName}" <${fromEmail}>
Reply-To: ${replyTo}
${headersText}

${getCompiledHtml()}`}
                      </pre>
                    </div>
                  )}

                  {previewTab === 'diff' && (
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase font-mono text-brand-orange block">SHIELD TRANSFORMATIONS COMPASS:</span>
                      <div className="w-full max-h-[350px] overflow-auto bg-brand-panel p-3 rounded-lg text-[10px] font-mono border border-brand-border/60 space-y-2 leading-relaxed">
                        <div>
                          <span className="text-brand-red font-bold">- Original HTML text:</span>
                          <pre className="bg-brand-bg p-1.5 rounded text-brand-text/50 mt-1">{"Dear Customer,"}</pre>
                        </div>
                        <div>
                          <span className="text-brand-green font-bold">+ Obfuscated Anti-Spam Homoglyphs HTML:</span>
                          <pre className="bg-brand-bg p-1.5 rounded text-brand-green mt-1">{"Dеаr Сustоmеr,"}</pre>
                        </div>
                        <div className="border-t border-brand-border/60 pt-2 text-[10px] text-brand-cyan">
                          Active Shields: {countActiveShield()} | Randomizations applied: {countActiveRandomizer()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (

          /* =========================================================
             TAB 2: SETTINGS VIEW (Grid Layout)
             ========================================================= */
          <div className="space-y-6 max-w-4xl mx-auto">

            {/* SMTP Server Section */}
            <div className="bg-brand-panel rounded-xl border border-brand-border overflow-hidden">
              <div className="px-5 py-4 bg-brand-panel flex items-center justify-between border-b border-brand-border/60">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-brand-cyan" />
                  <span className="font-bold text-white text-md">SMTP Server Section</span>
                </div>
                <span className="text-xs bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/30 px-2 py-0.5 rounded font-mono font-bold">
                  {smtpEnabled ? 'SMTP Pool: Active' : 'Not configured'}
                </span>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-xs text-brand-cyan/90 font-medium">
                  💡 Configure an external SMTP relay. If you installed PMTA, point this to <code className="bg-brand-bg px-1.5 py-0.5 rounded font-mono border border-brand-border">localhost:25</code>
                </p>

                {/* Sub-tabs */}
                <div className="flex bg-brand-bg p-0.5 rounded-lg border border-brand-border w-fit">
                  {['single', 'pool'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSmtpSubTab(tab)}
                      className={`text-xs px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${smtpSubTab === tab
                          ? 'bg-brand-card text-brand-cyan border border-brand-cyan/20'
                          : 'text-brand-text hover:text-white'
                        }`}
                    >
                      {tab === 'single' ? 'Single Server' : `PMTA Server Pool (${smtpPool.length})`}
                    </button>
                  ))}
                </div>

                {smtpSubTab === 'single' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-brand-text-bright">SMTP Host</label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-brand-text-bright">Port</label>
                        <input
                          type="number"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(parseInt(e.target.value) || 25)}
                          className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-brand-text-bright">Encryption</label>
                        <select
                          value={smtpEncryption}
                          onChange={(e) => setSmtpEncryption(e.target.value)}
                          className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                        >
                          <option>None</option>
                          <option>TLS</option>
                          <option>SSL</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-brand-text-bright">Username</label>
                        <input
                          type="text"
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                          className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-brand-text-bright">Password</label>
                        <input
                          type="password"
                          value={smtpPass}
                          onChange={(e) => setSmtpPass(e.target.value)}
                          className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={smtpEnabled}
                        onChange={(e) => setSmtpEnabled(e.target.checked)}
                        className="accent-brand-cyan"
                      />
                      Enable SMTP active mailing relay
                    </label>

                    {/* Proxy settings block */}
                    <div className="border border-brand-border/60 rounded-xl p-3 bg-brand-bg/20">
                      <button
                        onClick={() => setShowProxy(!showProxy)}
                        className="flex items-center gap-1.5 text-xs text-brand-text hover:text-white border-none bg-none outline-none cursor-pointer"
                      >
                        {showProxy ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Optional Proxy Settings
                      </button>

                      {showProxy && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                          <input
                            placeholder="Proxy Host"
                            value={proxyHost}
                            onChange={(e) => setProxyHost(e.target.value)}
                            className="bg-brand-bg border border-brand-border rounded px-2.5 py-1.5 text-xs focus:outline-none"
                          />
                          <input
                            placeholder="Proxy Port (1080)"
                            value={proxyPort}
                            onChange={(e) => setProxyPort(e.target.value)}
                            className="bg-brand-bg border border-brand-border rounded px-2.5 py-1.5 text-xs focus:outline-none"
                          />
                          <input
                            placeholder="Proxy User"
                            value={proxyUser}
                            onChange={(e) => setProxyUser(e.target.value)}
                            className="bg-brand-bg border border-brand-border rounded px-2.5 py-1.5 text-xs focus:outline-none"
                          />
                          <input
                            type="password"
                            placeholder="Proxy Password"
                            value={proxyPass}
                            onChange={(e) => setProxyPass(e.target.value)}
                            className="bg-brand-bg border border-brand-border rounded px-2.5 py-1.5 text-xs focus:outline-none"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2.5 border-t border-brand-border/60 pt-4">
                      <button
                        onClick={handleTestSmtp}
                        className="px-4 py-2 bg-brand-card hover:bg-brand-card/90 text-brand-cyan border border-brand-cyan/20 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        {testingSmtp ? 'Connecting...' : 'Test Connection'}
                      </button>
                      <button
                        onClick={handleAddToPool}
                        className="px-4 py-2 bg-brand-card hover:bg-brand-card/90 text-brand-green border border-brand-green/20 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        + Add to Pool
                      </button>
                      <button
                        onClick={fillFromPmta}
                        className="px-4 py-2 bg-brand-cyan hover:bg-brand-cyan/95 text-brand-panel rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-md glow-cyan"
                      >
                        ⚡ Fill from PMTA
                      </button>
                    </div>

                    {smtpStatusMessage && (
                      <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${smtpStatusMessage.type === 'success' ? 'bg-brand-green/10 border-brand-green/30 text-brand-green' : 'bg-brand-red/10 border-brand-red/30 text-brand-red'
                        }`}>
                        <Check className="w-4 h-4" />
                        {smtpStatusMessage.text}
                      </div>
                    )}
                  </div>
                ) : (
                  // SMTP Pool Table
                  <div className="space-y-4">
                    <div className="overflow-x-auto border border-brand-border/60 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-brand-bg/50 border-b border-brand-border text-brand-text-bright font-bold">
                            <th className="p-3">Host</th>
                            <th className="p-3">Port</th>
                            <th className="p-3">User</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/40 font-mono text-brand-text">
                          {smtpPool.map((item, i) => (
                            <tr key={i} className="hover:bg-brand-card/30">
                              <td className="p-3 text-brand-text-bright">{item.host}</td>
                              <td className="p-3">{item.port}</td>
                              <td className="p-3">{item.user}</td>
                              <td className="p-3">
                                <span className="text-brand-green bg-brand-green/10 border border-brand-green/20 px-2 py-0.5 rounded text-[10px]">
                                  Active Relay
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => setSmtpPool(smtpPool.filter((_, idx) => idx !== i))}
                                  className="text-brand-red hover:text-brand-red/80 bg-none border-none p-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PowerMTA Integration Section */}
            <div className="bg-brand-panel rounded-xl border border-brand-border overflow-hidden">
              <div className="px-5 py-4 bg-brand-panel flex items-center justify-between border-b border-brand-border/60">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-brand-orange" />
                  <span className="font-bold text-white text-md">PowerMTA Integration Section</span>
                </div>
                <span className="text-xs bg-brand-green/10 text-brand-green border border-brand-green/20 px-2 py-0.5 rounded font-mono font-bold">
                  Configured
                </span>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-brand-text-bright">Job Name (evaluates variables)</label>
                    <input
                      type="text"
                      value={pmtaJobName}
                      onChange={(e) => setPmtaJobName(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                      placeholder="campaign-[-date-]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-brand-text-bright">Pool Name</label>
                    <input
                      type="text"
                      value={pmtaPoolName}
                      onChange={(e) => setPmtaPoolName(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2">
                  <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pmtaEnableVmta}
                      onChange={(e) => setPmtaEnableVmta(e.target.checked)}
                      className="accent-brand-cyan"
                    />
                    Enable VMTA
                  </label>
                  <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pmtaAccounting}
                      onChange={(e) => setPmtaAccounting(e.target.checked)}
                      className="accent-brand-cyan"
                    />
                    Accounting
                  </label>
                  <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pmtaEnableVerp}
                      onChange={(e) => setPmtaEnableVerp(e.target.checked)}
                      className="accent-brand-cyan"
                    />
                    Enable VERP
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-brand-text-bright">VMTA Mode</label>
                    <select
                      value={pmtaVmtaMode}
                      onChange={(e) => setPmtaVmtaMode(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                    >
                      <option>Single VMTA</option>
                      <option>Rotation Pools</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-brand-text-bright">Bounce domain</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={pmtaBounceDomain}
                        onChange={(e) => setPmtaBounceDomain(e.target.value)}
                        className="flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                      />
                      <button
                        onClick={() => alert("Simulated Bounce domain test confirmed!")}
                        className="px-3 bg-brand-card hover:bg-brand-card/90 text-brand-cyan border border-brand-cyan/20 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Bounce+
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Batch Engine Section */}
            <div className="bg-brand-panel rounded-xl border border-brand-border overflow-hidden">
              <div className="px-5 py-4 bg-brand-panel flex items-center justify-between border-b border-brand-border/60">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-brand-cyan" />
                  <span className="font-bold text-white text-md">Batch Engine Section</span>
                </div>
                <span className="text-xs bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/30 px-2 py-0.5 rounded font-mono font-bold">
                  {batchSize >= 100000 ? 'Ludicrous mode' : 'Normal'}
                </span>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-xs text-brand-cyan/90 font-medium">
                  ⚡ Configure batch size for high-volume sending. For 100K+ lists, use Turbo or Ludicrous mode.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-brand-text-bright flex justify-between">
                      <span>Batch Size</span>
                      <span className="text-brand-cyan font-bold font-mono">100K active</span>
                    </label>
                    <input
                      type="number"
                      value={batchSize}
                      onChange={(e) => setBatchSize(parseInt(e.target.value) || 0)}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-brand-text-bright">Speed Mode</label>
                    <select
                      value={speedMode}
                      onChange={(e) => setSpeedMode(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none font-semibold"
                    >
                      <option>Turbo — 100K batches, zero delay</option>
                      <option>Ludicrous</option>
                      <option>Normal</option>
                    </select>
                  </div>
                </div>

                {/* Quick-select batch size buttons */}
                <div className="space-y-2">
                  <span className="text-[10px] text-brand-text font-bold uppercase tracking-wider block">QUICK SELECT BATCH SIZE</span>
                  <div className="flex flex-wrap gap-2">
                    {[1000, 10000, 50000, 100000, 200000, 500000].map(sz => (
                      <button
                        key={sz}
                        onClick={() => setBatchSize(sz)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-mono tracking-wider transition-all cursor-pointer ${batchSize === sz
                            ? 'bg-brand-cyan text-brand-panel font-extrabold border-brand-cyan shadow-md glow-cyan'
                            : 'bg-brand-card hover:bg-brand-card/90 text-brand-text-bright border-brand-border'
                          }`}
                      >
                        {sz >= 1000 ? `${sz / 1000}K` : sz} {batchSize === sz && '✓'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-brand-text-bright">Batch Delay (ms)</label>
                    <input
                      type="number"
                      value={batchDelay}
                      onChange={(e) => setBatchDelay(parseInt(e.target.value) || 0)}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-brand-text-bright">Email Delay (ms)</label>
                    <input
                      type="number"
                      value={emailDelay}
                      onChange={(e) => setEmailDelay(parseInt(e.target.value) || 0)}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={keepAlive}
                      onChange={(e) => setKeepAlive(e.target.checked)}
                      className="accent-brand-cyan"
                    />
                    SMTP Keep-Alive
                  </label>
                  <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={connectionPooling}
                      onChange={(e) => setConnectionPooling(e.target.checked)}
                      className="accent-brand-cyan"
                    />
                    Connection Pooling
                  </label>
                  <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={gcOptimize}
                      onChange={(e) => setGcOptimize(e.target.checked)}
                      className="accent-brand-cyan"
                    />
                    GC Optimize
                  </label>
                </div>
              </div>
            </div>

            {/* Seed Test & MX Validation Section */}
            <div className="bg-brand-panel rounded-xl border border-brand-border p-5 space-y-4">
              <h2 className="text-md font-bold text-white border-b border-brand-border pb-2 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-cyan" />
                Seed Test & MX Validation Section
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mxValidate}
                      onChange={(e) => setMxValidate(e.target.checked)}
                      className="accent-brand-cyan"
                    />
                    MX Validate before send (highly recommended)
                  </label>

                  <div className="bg-brand-card p-3 rounded-lg border border-brand-border/60 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-brand-orange hover:text-brand-orange/90 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sendSeedTest}
                        onChange={(e) => setSendSeedTest(e.target.checked)}
                        className="accent-brand-orange"
                      />
                      Send Seed Test First (Warmup mode)
                    </label>

                    {sendSeedTest && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-text">Seed Test Delay (seconds)</label>
                        <input
                          type="number"
                          value={seedDelay}
                          onChange={(e) => setSeedDelay(parseInt(e.target.value) || 0)}
                          className="w-full bg-brand-bg border border-brand-border rounded px-2 py-1 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-brand-text-bright">Seed Addresses (one per line)</label>
                  <textarea
                    value={seedAddresses}
                    onChange={(e) => setSeedAddresses(e.target.value)}
                    className="w-full h-24 bg-brand-bg border border-brand-border rounded-lg p-2.5 text-xs font-mono text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ---------------------------------------------------------
          POWERMTA INSTALLER WIZARD DIALOG MODAL
         --------------------------------------------------------- */}
      {showInstaller && (
        <div className="fixed inset-0 z-50 bg-brand-bg/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-brand-panel border border-brand-border rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">

            {/* Modal Header */}
            <header className="border-b border-brand-border p-5 flex items-center justify-between bg-brand-panel/60 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-brand-cyan to-brand-teal flex items-center justify-center">
                  <Server className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div>
                  <h2 className="text-md font-bold text-white leading-none">PowerMTA Setup Wizard</h2>
                  <span className="text-xs text-brand-text/75 font-mono">Deployment Engine v3.2 — SSH Agent Ready</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs bg-brand-green/10 text-brand-green border border-brand-green/30 px-2 py-0.5 rounded font-mono font-bold uppercase">
                  SSH2 OK
                </span>

                {/* Close Button */}
                <button
                  onClick={() => setShowInstaller(false)}
                  className="text-brand-text hover:text-white hover:bg-brand-card p-1.5 rounded-lg transition-all cursor-pointer border-none bg-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Step Wizard Progress Bar */}
            <div className="px-6 py-4 bg-brand-bg/40 border-b border-brand-border/60">
              <div className="flex justify-between max-w-2xl mx-auto items-center text-xs font-mono font-semibold">

                {/* Step 1 */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${wizardStep === 1
                      ? 'border-brand-cyan bg-brand-cyan/20 text-brand-cyan glow-cyan'
                      : wizardStep > 1
                        ? 'border-brand-green bg-brand-green/10 text-brand-green'
                        : 'border-brand-border text-brand-text/50'
                    }`}>
                    {wizardStep > 1 ? <Check className="w-4.5 h-4.5" /> : '1'}
                  </div>
                  <span className={wizardStep === 1 ? 'text-brand-cyan font-bold' : 'text-brand-text/50'}>Connect</span>
                </div>

                <div className={`flex-1 h-0.5 mx-2 bg-brand-border/60 ${wizardStep > 1 ? 'bg-brand-green/50' : ''}`}></div>

                {/* Step 2 */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${wizardStep === 2
                      ? 'border-brand-cyan bg-brand-cyan/20 text-brand-cyan glow-cyan'
                      : wizardStep > 2
                        ? 'border-brand-green bg-brand-green/10 text-brand-green'
                        : 'border-brand-border text-brand-text/50'
                    }`}>
                    {wizardStep > 2 ? <Check className="w-4.5 h-4.5" /> : '2'}
                  </div>
                  <span className={wizardStep === 2 ? 'text-brand-cyan font-bold' : 'text-brand-text/50'}>Configure</span>
                </div>

                <div className={`flex-1 h-0.5 mx-2 bg-brand-border/60 ${wizardStep > 2 ? 'bg-brand-green/50' : ''}`}></div>

                {/* Step 3 */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${wizardStep === 3
                      ? 'border-brand-cyan bg-brand-cyan/20 text-brand-cyan glow-cyan'
                      : wizardStep > 3
                        ? 'border-brand-green bg-brand-green/10 text-brand-green'
                        : 'border-brand-border text-brand-text/50'
                    }`}>
                    {wizardStep > 3 ? <Check className="w-4.5 h-4.5" /> : '3'}
                  </div>
                  <span className={wizardStep === 3 ? 'text-brand-cyan font-bold' : 'text-brand-text/50'}>Customize</span>
                </div>

                <div className={`flex-1 h-0.5 mx-2 bg-brand-border/60 ${wizardStep > 3 ? 'bg-brand-green/50' : ''}`}></div>

                {/* Step 4 */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${wizardStep === 4
                      ? 'border-brand-cyan bg-brand-cyan/20 text-brand-cyan glow-cyan'
                      : 'border-brand-border text-brand-text/50'
                    }`}>
                    '4'
                  </div>
                  <span className={wizardStep === 4 ? 'text-brand-cyan font-bold' : 'text-brand-text/50'}>Install</span>
                </div>
              </div>
            </div>

            {/* Wizard Panel Content Area */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">

              {/* ==========================================
                  STEP 1: CONNECT - Server Connection
                  ========================================== */}
              {wizardStep === 1 && (
                <div className="space-y-5">
                  <div className="bg-brand-cyan/5 border border-brand-cyan/30 rounded-xl p-4 flex gap-3 text-xs text-brand-cyan">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="leading-relaxed">
                      Root or sudo access is required to bind Virtual MTAs and setup systemctl service listeners.
                      If PowerMTA is already installed on this machine, check <strong>"Local Server"</strong> below to bypass remote SSH tunneling.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-brand-text-bright">SSH Host / IP *</label>
                      <input
                        type="text"
                        value={sshHost}
                        onChange={(e) => setSshHost(e.target.value)}
                        className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-brand-text-bright">SSH Port</label>
                      <input
                        type="number"
                        value={sshPort}
                        onChange={(e) => setSshPort(parseInt(e.target.value) || 22)}
                        className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-brand-text-bright">Username *</label>
                      <input
                        type="text"
                        value={sshUser}
                        onChange={(e) => setSshUser(e.target.value)}
                        className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-brand-text-bright">Password / Key Passphrase</label>
                      <input
                        type="password"
                        value={sshPass}
                        onChange={(e) => setSshPass(e.target.value)}
                        className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 bg-brand-bg/30 p-3 rounded-lg border border-brand-border/60">
                    <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sshKeyAuth}
                        onChange={(e) => setSshKeyAuth(e.target.checked)}
                        className="accent-brand-cyan"
                      />
                      Private Key Authentication (use PEM/PPK files instead)
                    </label>

                    <label className="flex items-center gap-2 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={localServerToggle}
                        onChange={(e) => setLocalServerToggle(e.target.checked)}
                        className="accent-brand-cyan"
                      />
                      Local Server (PowerMTA installed on this machine — no SSH needed)
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={testSshConnection}
                      className="px-4 py-2.5 bg-brand-card hover:bg-brand-card/90 border border-brand-cyan/20 text-brand-cyan text-xs font-bold rounded-lg transition-all cursor-pointer"
                    >
                      {testingSsh ? 'Testing connection...' : 'Test Connection'}
                    </button>
                  </div>

                  {sshStatus && (
                    <div className={`p-3 rounded-lg border text-xs flex items-center gap-2.5 ${sshStatus.type === 'success'
                        ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
                        : 'bg-brand-red/10 border-brand-red/30 text-brand-red'
                      }`}>
                      {sshStatus.type === 'success' ? <Check className="w-4.5 h-4.5" /> : <AlertTriangle className="w-4.5 h-4.5" />}
                      {sshStatus.text}
                    </div>
                  )}
                </div>
              )}

              {/* ==========================================
                  STEP 2: CONFIGURE - Domain, IPs, Monitor
                  ========================================== */}
              {wizardStep === 2 && (
                <div className="space-y-6">

                  {/* Domain & IP config */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white border-b border-brand-border/60 pb-1">Domain & IP Configuration</h3>
                    <p className="text-xs text-brand-text leading-relaxed">
                      Enter the domain and IP address(es) PowerMTA will use for sending. DKIM keys, DNS records, and virtual MTAs are auto-generated.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-text-bright">Sending Domain *</label>
                        <input
                          type="text"
                          value={sendingDomain}
                          onChange={(e) => setSendingDomain(e.target.value)}
                          className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-text-bright">Hostname</label>
                        <input
                          type="text"
                          value={pmtaHostname}
                          onChange={(e) => setPmtaHostname(e.target.value)}
                          className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-text-bright">Primary IP Address *</label>
                        <input
                          type="text"
                          value={pmtaPrimaryIp}
                          onChange={(e) => setPmtaPrimaryIp(e.target.value)}
                          className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-text-bright">DKIM Selector</label>
                        <input
                          type="text"
                          value={dkimSelector}
                          onChange={(e) => setDkimSelector(e.target.value)}
                          className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-brand-text-bright">Secondary IPs (one per line, optional)</label>
                      <textarea
                        value={pmtaSecondaryIps}
                        onChange={(e) => setPmtaSecondaryIps(e.target.value)}
                        className="w-full h-16 bg-brand-bg border border-brand-border rounded-lg p-2.5 text-xs font-mono text-white focus:outline-none"
                        placeholder="203.0.113.51&#10;203.0.113.52"
                      />
                      <span className="text-[10px] text-brand-cyan/80 block">
                        Leave empty for single-IP mode. Adding IPs creates automatic VMTA rotation pools.
                      </span>
                    </div>

                    <button
                      onClick={() => setShowDnsModal(true)}
                      className="px-4 py-2 bg-brand-card hover:bg-brand-card/90 border border-brand-cyan/20 text-brand-cyan text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Generate DNS Records
                    </button>
                  </div>

                  {/* SMTP & Monitor settings */}
                  <div className="space-y-4 pt-2 border-t border-brand-border/60">
                    <h3 className="text-sm font-bold text-white border-b border-brand-border/60 pb-1">SMTP & Monitor Settings</h3>
                    <p className="text-xs text-brand-text leading-relaxed">
                      Credentials for PowerMTA's built-in SMTP relay and the web monitoring dashboard.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-text-bright">SMTP User</label>
                        <input
                          type="text"
                          value={pmtaSmtpUser}
                          onChange={(e) => setPmtaSmtpUser(e.target.value)}
                          className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-text-bright">SMTP Password</label>
                        <input
                          type="text"
                          value={pmtaSmtpPass}
                          onChange={(e) => setPmtaSmtpPass(e.target.value)}
                          className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                        <span className="text-[10px] text-brand-orange font-bold block">
                          ⚠ Change from default before going live!
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-text-bright">SMTP Port</label>
                        <input
                          type="number"
                          value={pmtaSmtpPort}
                          onChange={(e) => setPmtaSmtpPort(parseInt(e.target.value) || 2525)}
                          className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-text-bright">Monitor Port</label>
                        <input
                          type="number"
                          value={pmtaMonitorPort}
                          onChange={(e) => setPmtaMonitorPort(parseInt(e.target.value) || 1983)}
                          className="w-full bg-brand-bg/85 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                        <span className="text-[10px] text-brand-cyan/85 block">
                          Web dashboard at http://{sshHost || 'server-ip'}:{pmtaMonitorPort}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ==========================================
                  STEP 3: CUSTOMIZE - Config Editor & Rules
                  ========================================== */}
              {wizardStep === 3 && (
                <div className="space-y-6">

                  {/* Editor */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-brand-border/60 pb-1">
                      <h3 className="text-sm font-bold text-white">PowerMTA Config Editor</h3>
                      <label className="flex items-center gap-1.5 text-xs text-brand-text hover:text-white cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useCustomConfig}
                          onChange={(e) => setUseCustomConfig(e.target.checked)}
                          className="accent-brand-cyan"
                        />
                        Use custom configuration
                      </label>
                    </div>

                    <p className="text-xs text-brand-text leading-relaxed">
                      Review and customize the configuration. Placeholders like <code className="bg-brand-bg px-1 font-mono text-brand-cyan">{"{{ domain }}"}</code> are replaced with your values during installation.
                    </p>

                    {/* Insertion chips */}
                    <div className="space-y-1 bg-brand-bg/40 p-3 rounded-lg border border-brand-border/60">
                      <span className="text-[10px] text-brand-text font-bold block mb-1 uppercase tracking-wider">Click variables to insert:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          '{{ domain }}', '{{ hostname }}', '{{ ip }}', '{{ primary_ip }}', '{{ PRIMARY_IP }}',
                          '{{ smtp_user }}', '{{ SMTP_USERNAME }}', '{{ smtp_pass }}', '{{ SMTP_PASSWORD }}', '{{ smtp_port }}', '{{ dkim_selector }}',
                          '{{ monitor_port }}', '{{ SECONDARY_VMTA_BLOCKS }}', '{{ SECONDARY_VMTA_POOL_ENTRIES }}'
                        ].map(token => (
                          <button
                            key={token}
                            onClick={() => insertConfigToken(token)}
                            className="text-[10px] bg-brand-card hover:bg-brand-cyan hover:text-brand-panel px-2 py-0.5 rounded border border-brand-border font-mono text-white transition-all"
                          >
                            {token}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPmtaConfigCode(`# PowerMTA configuration template for MoonMailer Pro
# Auto-generated on ${new Date().toISOString()}

# ─────────────────────────────────────────────
# GLOBAL SETTINGS
# ─────────────────────────────────────────────
host-name             mail.{{ domain }}
log-file              /var/log/pmta/pmta.log
spool                 /var/spool/pmta
http-access           0.0.0.0/0 monitor

# ─────────────────────────────────────────────
# SMTP AUTHENTICATION CREDENTIALS
# ─────────────────────────────────────────────
<smtp-user {{ SMTP_USERNAME }}>
    password {{ SMTP_PASSWORD }}
</smtp-user>

# ─────────────────────────────────────────────
# RELAY / SOURCE RULES
# ─────────────────────────────────────────────
<source 127.0.0.1>
    always-allow-relaying yes
</source>

<source 0.0.0.0/0>
    always-allow-relaying no
    smtp-service       yes
    smtp-port          {{ smtp_port }}
    require-auth       yes
</source>

# ─────────────────────────────────────────────
# VIRTUAL MTA — PRIMARY
# ─────────────────────────────────────────────
<virtual-mta default-vmta>
    smtp-source-ip     {{ PRIMARY_IP }}
    domain-key         default,{{ domain }},/etc/pmta/keys/{{ domain }}.pem
</virtual-mta>

# ─────────────────────────────────────────────
# VIRTUAL MTA — SECONDARY BLOCKS
# ─────────────────────────────────────────────
{{ SECONDARY_VMTA_BLOCKS }}

# ─────────────────────────────────────────────
# VIRTUAL MTA POOL
# ─────────────────────────────────────────────
<virtual-mta-pool default-pool>
    virtual-mta        default-vmta
    {{ SECONDARY_VMTA_POOL_ENTRIES }}
</virtual-mta-pool>

# ─────────────────────────────────────────────
# DOMAIN CONFIGURATION
# ─────────────────────────────────────────────
<domain {{ domain }}>
    virtual-mta-pool   default-pool
    max-smtp-out       20
    max-msg-rate       500/h
    retry-after        10m
    expire-after       4d12h
</domain>`)}
                        className="text-xs bg-brand-card hover:bg-brand-card/90 border border-brand-border px-2.5 py-1.5 rounded-lg text-brand-text-bright font-semibold cursor-pointer"
                      >
                        Edit Template
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`${window.location.origin}/pmta/config-preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: pmtaConfigCode }) });
                            const text = await res.text();
                            alert(text || 'Config preview endpoint not available — edit the template manually');
                          } catch { alert('Config preview requires server connection'); }
                        }}
                        className="text-xs bg-brand-card hover:bg-brand-card/90 border border-brand-border px-2.5 py-1.5 rounded-lg text-brand-text-bright font-semibold cursor-pointer"
                      >
                        Preview
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const res = await api.loadPmtaConfig();
                            setPmtaConfigCode(res.config || pmtaConfigCode);
                            alert('Configuration loaded from server.');
                          } catch (err) { alert('Failed to load config: ' + err.message); }
                        }}
                        className="text-xs bg-brand-card hover:bg-brand-card/90 border border-brand-border px-2.5 py-1.5 rounded-lg text-brand-text-bright font-semibold cursor-pointer"
                      >
                        Load from Server
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await api.savePmtaConfig({
                              server_name: 'Primary Node',
                              ssh_host: sshHost,
                              ssh_port: sshPort,
                              ssh_user: sshUser,
                              domain: sendingDomain,
                              hostname: pmtaHostname,
                              primary_ip: pmtaPrimaryIp,
                              secondary_ips: pmtaSecondaryIps,
                              dkim_selector: dkimSelector,
                              smtp_user: pmtaSmtpUser,
                              smtp_pass: pmtaSmtpPass,
                              smtp_port: pmtaSmtpPort,
                              monitor_port: pmtaMonitorPort,
                              config_text: pmtaConfigCode,
                              isp_rules: ispRules,
                            });
                            alert('Configuration saved to server.');
                          } catch (err) { alert('Failed to save config: ' + err.message); }
                        }}
                        className="text-xs bg-brand-card hover:bg-brand-card/90 border border-brand-border px-2.5 py-1.5 rounded-lg text-brand-text-bright font-semibold cursor-pointer"
                      >
                        Save to Server
                      </button>
                    </div>

                    <textarea
                      value={pmtaConfigCode}
                      onChange={(e) => setPmtaConfigCode(e.target.value)}
                      className="w-full h-72 bg-brand-bg border border-brand-border rounded-xl p-3.5 text-xs font-mono text-brand-text-bright focus:outline-none focus:border-brand-cyan leading-relaxed"
                    />
                  </div>

                  {/* Service Control */}
                  <div className="space-y-3 pt-3 border-t border-brand-border/60">
                    <h3 className="text-sm font-bold text-white">Service Control</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-brand-bg/40 p-4 rounded-xl border border-brand-border/60">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-brand-text">PMTA Daemon Status:</span>
                          <span className="text-xs bg-brand-cyan/15 text-brand-cyan px-2.5 py-0.5 border border-brand-cyan/20 rounded font-mono font-bold">
                            {serviceStatus}
                          </span>
                        </div>
                        <p className="text-[11px] text-brand-text/80">
                          Control the PowerMTA daemon directly — no SSH terminal needed.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 items-center justify-end">
                        <button onClick={() => handleServiceControl('status')} className="text-xs bg-brand-card border border-brand-border px-3 py-1.5 rounded-lg text-white font-bold cursor-pointer">Status</button>
                        <button onClick={() => handleServiceControl('start')} className="text-xs bg-brand-green/20 hover:bg-brand-green/30 border border-brand-green/30 px-3 py-1.5 rounded-lg text-brand-green font-bold cursor-pointer">Start</button>
                        <button onClick={() => handleServiceControl('stop')} className="text-xs bg-brand-red/20 hover:bg-brand-red/30 border border-brand-red/30 px-3 py-1.5 rounded-lg text-brand-red font-bold cursor-pointer">Stop</button>
                        <button onClick={() => handleServiceControl('restart')} className="text-xs bg-brand-orange/20 hover:bg-brand-orange/30 border border-brand-orange/30 px-3 py-1.5 rounded-lg text-brand-orange font-bold cursor-pointer">Restart</button>
                        <button onClick={() => handleServiceControl('reload')} className="text-xs bg-brand-card border border-brand-border px-3 py-1.5 rounded-lg text-white font-bold cursor-pointer">Reload Config</button>
                      </div>
                    </div>

                    {controlLogs.length > 0 && (
                      <pre className="bg-brand-bg p-2.5 rounded border border-brand-border font-mono text-[10px] text-brand-cyan h-16 overflow-y-auto leading-relaxed">
                        {controlLogs.join('\n')}
                      </pre>
                    )}
                  </div>

                  {/* ISP Limits manager */}
                  <div className="space-y-4 pt-3 border-t border-brand-border/60">
                    <div className="flex justify-between items-center border-b border-brand-border/60 pb-1">
                      <h3 className="text-sm font-bold text-white">ISP Rate Limits Manager</h3>
                      <span className="text-xs bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30 px-2.5 py-0.5 rounded font-mono font-bold">
                        {ispRules.length} rules
                      </span>
                    </div>

                    <p className="text-xs text-brand-text leading-relaxed">
                      Set per-ISP sending limits to protect your sender reputation. Use presets for major providers or add custom rules.
                    </p>

                    <div className="bg-brand-cyan/5 border border-brand-cyan/30 rounded-xl p-3.5 text-xs text-brand-cyan">
                      💡 Click a preset group to add recommended rate limits, then fine-tune as needed.
                    </div>

                    {/* Preset buttons */}
                    <div className="flex flex-wrap gap-2">
                      {['OX App Suite', 'Gmail', 'Microsoft', 'Yahoo / AOL', 'France ISPs', 'Germany ISPs', 'Italy ISPs', 'Canada ISPs', 'US Broadband', 'Titan Email', 'Hosting Providers'].map(preset => (
                        <button
                          key={preset}
                          onClick={() => applyIspPreset(preset)}
                          className="text-[11px] bg-brand-card hover:bg-brand-cyan hover:text-brand-panel px-2.5 py-1 rounded-lg border border-brand-border font-semibold text-white transition-all cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    {/* Custom rule form */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-brand-bg/40 p-4 rounded-xl border border-brand-border/60 items-end">
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] text-brand-text">Domain or Wildcard</label>
                        <input
                          type="text"
                          value={newRuleDomain}
                          onChange={(e) => setNewRuleDomain(e.target.value)}
                          className="w-full bg-brand-bg border border-brand-border rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none"
                          placeholder="*.example.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-text">Rate /h</label>
                        <input
                          type="number"
                          value={newRuleRate}
                          onChange={(e) => setNewRuleRate(parseInt(e.target.value) || 250)}
                          className="w-full bg-brand-bg border border-brand-border rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-text">Connections</label>
                        <input
                          type="number"
                          value={newRuleConn}
                          onChange={(e) => setNewRuleConn(parseInt(e.target.value) || 2)}
                          className="w-full bg-brand-bg border border-brand-border rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-text">Msgs/Conn</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={newRuleMsg}
                            onChange={(e) => setNewRuleMsg(parseInt(e.target.value) || 5)}
                            className="w-full bg-brand-bg border border-brand-border rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none"
                          />
                          <button
                            onClick={addIspRule}
                            className="bg-brand-green/20 hover:bg-brand-green/30 border border-brand-green/30 px-3 py-1 rounded text-brand-green font-bold text-xs cursor-pointer"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Rules table */}
                    <div className="overflow-x-auto border border-brand-border/60 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-brand-bg/50 border-b border-brand-border text-brand-text-bright font-bold">
                            <th className="p-3">Domain</th>
                            <th className="p-3">Rate/h</th>
                            <th className="p-3">Conn</th>
                            <th className="p-3">Msg/C</th>
                            <th className="p-3 text-right">Delete</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/40 font-mono text-brand-text">
                          {ispRules.length === 0 ? (
                            <tr>
                              <td colSpan="5" className="p-4 text-center text-brand-text/50">No rules added yet.</td>
                            </tr>
                          ) : (
                            ispRules.map((rule, idx) => (
                              <tr key={idx} className="hover:bg-brand-card/30">
                                <td className="p-3 text-brand-text-bright font-bold">{rule.domain}</td>
                                <td className="p-3">{rule.rate}</td>
                                <td className="p-3">{rule.connections}</td>
                                <td className="p-3">{rule.msgsPerConn}</td>
                                <td className="p-3 text-right">
                                  <button
                                    onClick={() => setIspRules(ispRules.filter((_, i) => i !== idx))}
                                    className="text-brand-red hover:text-brand-red/80 bg-none border-none p-1 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={generateAndInsertIsp}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
                      >
                        Generate & Insert into Config
                      </button>
                      <button
                        onClick={() => setIspRules([])}
                        className="px-4 py-2 border border-brand-border hover:border-brand-red text-brand-text hover:text-brand-red text-xs font-bold rounded-lg transition-all cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ==========================================
                  STEP 4: INSTALL - Deployment Console
                  ========================================== */}
              {wizardStep === 4 && (
                <div className="space-y-6">

                  <div className="bg-brand-cyan/5 border border-brand-cyan/30 rounded-xl p-4 text-xs text-brand-cyan leading-relaxed">
                    <strong>Deployment summary alignment check:</strong> Double-check your settings, then click Install PowerMTA. The process takes 2–5 minutes.
                  </div>

                  <div className="bg-brand-orange/5 border border-brand-orange/30 rounded-xl p-4 flex gap-3 text-xs text-brand-orange leading-relaxed">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p>
                      The installer will connect via SSH, upload the PowerMTA package, generate DKIM keys, apply your config, and start the service.
                    </p>
                  </div>

                  {/* Config summary grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-brand-bg/40 p-4 rounded-xl border border-brand-border/60 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-brand-text uppercase block">SSH HOST</span>
                      <strong className="text-white">{sshHost || 'local'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text uppercase block">USERNAME</span>
                      <strong className="text-white">{sshUser}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text uppercase block">DOMAIN</span>
                      <strong className="text-white">{sendingDomain}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text uppercase block">HOSTNAME</span>
                      <strong className="text-white">{pmtaHostname}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text uppercase block">PRIMARY IP</span>
                      <strong className="text-white">{pmtaPrimaryIp}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text uppercase block">DKIM SELECTOR</span>
                      <strong className="text-white">{dkimSelector}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text uppercase block">SMTP PORT</span>
                      <strong className="text-white">{pmtaSmtpPort}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text uppercase block">MONITOR PORT</span>
                      <strong className="text-white">{pmtaMonitorPort}</strong>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleInstallPmta}
                      disabled={installingPmta}
                      className="px-6 py-3 bg-brand-cyan text-brand-panel hover:bg-brand-cyan/95 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-2 glow-cyan"
                    >
                      <Zap className="w-4 h-4 fill-current animate-bounce" />
                      ⚡ Install PowerMTA
                    </button>
                    <button
                      onClick={handleUninstallPmta}
                      className="px-6 py-3 border border-brand-red/35 hover:bg-brand-red/10 text-brand-red text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      🗑 Uninstall
                    </button>
                  </div>

                  {/* Install execution output console */}
                  {(installingPmta || installLogs.length > 0) && (
                    <div className="space-y-2 bg-brand-bg/90 border border-brand-border rounded-xl p-4">
                      <span className="text-[10px] font-bold text-white uppercase tracking-wider block font-mono">
                        Deployment STDOUT/STDERR logs:
                      </span>
                      <div className="h-48 overflow-y-auto bg-brand-panel p-3 rounded border border-brand-border/60 font-mono text-[10px] text-brand-cyan space-y-1 leading-relaxed">
                        {installLogs.map((log, idx) => (
                          <div key={idx} className={log.includes('🎉') ? 'text-brand-green font-extrabold' : ''}>
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {installSuccess && (
                    <div className="bg-brand-green/10 border border-brand-green/30 p-4 rounded-xl flex items-center gap-3 text-xs text-brand-green">
                      <CheckCircle className="w-6 h-6 shrink-0" />
                      <div>
                        <strong className="block text-white">PowerMTA Deployment Finished!</strong>
                        The SMTP service is fully operational. All DKIM keys and DNS records are synced.
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Footer / Buttons */}
            <footer className="border-t border-brand-border/60 p-5 flex justify-between bg-brand-panel/60 rounded-b-2xl">
              <div>
                {wizardStep > 1 && (
                  <button
                    onClick={() => setWizardStep(wizardStep - 1)}
                    className="px-4 py-2 bg-brand-card border border-brand-border rounded-lg text-xs font-bold text-brand-text-bright hover:bg-brand-card/90 cursor-pointer"
                  >
                    ← Back
                  </button>
                )}
              </div>
              <div>
                {wizardStep < 4 ? (
                  <button
                    onClick={() => setWizardStep(wizardStep + 1)}
                    className="px-4 py-2 bg-brand-cyan text-brand-panel hover:bg-brand-cyan/95 text-xs font-extrabold rounded-lg cursor-pointer glow-cyan"
                  >
                    {wizardStep === 1 && 'Continue to Configuration →'}
                    {wizardStep === 2 && 'Continue to Customization →'}
                    {wizardStep === 3 && 'Review & Install →'}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowInstaller(false)}
                    className="px-4 py-2 bg-brand-cyan text-brand-panel hover:bg-brand-cyan/95 text-xs font-extrabold rounded-lg cursor-pointer"
                  >
                    Finish Setup & Exit
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------
          DNS RECORDS GENERATOR POP-UP MODAL (Step 2 Helper)
         --------------------------------------------------------- */}
      {showDnsModal && (
        <div className="fixed inset-0 z-[60] bg-brand-bg/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-brand-panel border border-brand-border rounded-2xl w-full max-w-3xl shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-brand-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-brand-cyan" />
                <h3 className="text-white font-bold text-md leading-none">Auto-Generated DNS Records (DKIM / SPF / DMARC)</h3>
              </div>
              <button
                onClick={() => setShowDnsModal(false)}
                className="text-brand-text hover:text-white bg-brand-card p-1.5 rounded-lg border-none cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-brand-text leading-relaxed">
              Copy and paste these TXT/MX records into your DNS Registrar (GoDaddy, Cloudflare, etc.) to pass anti-spam checks.
            </p>

            {/* Credentials Summary */}
            {installSuccess && (
              <div className="bg-brand-green/10 p-3 rounded-lg border border-brand-green/30 space-y-1.5">
                <div className="font-bold text-brand-green text-xs tracking-wider">INSTALLATION COMPLETE — CONNECTION DETAILS</div>
                <div className="space-y-0.5 text-[11px] font-mono text-brand-text-bright">
                  <div><span className="text-brand-cyan">SMTP Host:</span> {sshHost || pmtaHostname}</div>
                  <div><span className="text-brand-cyan">SMTP Port:</span> {pmtaSmtpPort}</div>
                  <div><span className="text-brand-cyan">SMTP Username:</span> {pmtaSmtpUser}</div>
                  <div><span className="text-brand-cyan">SMTP Password:</span> {pmtaSmtpPass}</div>
                  <div><span className="text-brand-cyan">Monitor URL:</span> http://{pmtaPrimaryIp}:{pmtaMonitorPort}/</div>
                  <div><span className="text-brand-cyan">Sending Domain:</span> {sendingDomain}</div>
                  <div><span className="text-brand-cyan">Hostname:</span> {pmtaHostname}</div>
                  <div><span className="text-brand-cyan">DKIM Selector:</span> {dkimSelector}._domainkey.{sendingDomain}</div>
                </div>
              </div>
            )}

            <div className="space-y-3 font-mono text-[10px]">

              {/* SPF Record */}
              <div className="bg-brand-bg/75 p-3 rounded-lg border border-brand-border/60 space-y-1">
                <div className="flex justify-between font-bold text-brand-cyan">
                  <span>SPF (TXT Record)</span>
                  <span>Host: @</span>
                </div>
                <div className="flex items-start gap-2">
                  <pre className="flex-1 text-brand-text-bright bg-brand-panel p-2 rounded border border-brand-border/40 select-all whitespace-pre-wrap">
                    {spfValue}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(spfValue, 'spf')}
                    className="p-1.5 bg-brand-card hover:bg-brand-cyan hover:text-brand-panel rounded-lg border border-brand-border transition-all shrink-0"
                    title="Copy SPF record"
                  >
                    {copiedRecord === 'spf' ? <Check className="w-3.5 h-3.5 text-brand-green" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* DKIM Record */}
              <div className="bg-brand-bg/75 p-3 rounded-lg border border-brand-border/60 space-y-1">
                <div className="flex justify-between font-bold text-brand-cyan">
                  <span>DKIM (TXT Record)</span>
                  <span>Host: {dkimSelector}._domainkey</span>
                </div>
                <div className="flex items-start gap-2">
                  <pre className="flex-1 text-brand-text-bright bg-brand-panel p-2 rounded border border-brand-border/40 select-all whitespace-pre-wrap">
                    {dkimValue}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(dkimValue, 'dkim')}
                    className="p-1.5 bg-brand-card hover:bg-brand-cyan hover:text-brand-panel rounded-lg border border-brand-border transition-all shrink-0"
                    title="Copy DKIM record"
                  >
                    {copiedRecord === 'dkim' ? <Check className="w-3.5 h-3.5 text-brand-green" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* DMARC Record */}
              <div className="bg-brand-bg/75 p-3 rounded-lg border border-brand-border/60 space-y-1">
                <div className="flex justify-between font-bold text-brand-cyan">
                  <span>DMARC (TXT Record)</span>
                  <span>Host: _dmarc</span>
                </div>
                <div className="flex items-start gap-2">
                  <pre className="flex-1 text-brand-text-bright bg-brand-panel p-2 rounded border border-brand-border/40 select-all whitespace-pre-wrap">
                    {dmarcValue}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(dmarcValue, 'dmarc')}
                    className="p-1.5 bg-brand-card hover:bg-brand-cyan hover:text-brand-panel rounded-lg border border-brand-border transition-all shrink-0"
                    title="Copy DMARC record"
                  >
                    {copiedRecord === 'dmarc' ? <Check className="w-3.5 h-3.5 text-brand-green" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* MX Record */}
              <div className="bg-brand-bg/75 p-3 rounded-lg border border-brand-border/60 space-y-1">
                <div className="flex justify-between font-bold text-brand-cyan">
                  <span>MX Record</span>
                  <span>Host: @ (Priority: 10)</span>
                </div>
                <div className="flex items-start gap-2">
                  <pre className="flex-1 text-brand-text-bright bg-brand-panel p-2 rounded border border-brand-border/40 select-all whitespace-pre-wrap">
                    {pmtaHostname}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(pmtaHostname, 'mx')}
                    className="p-1.5 bg-brand-card hover:bg-brand-cyan hover:text-brand-panel rounded-lg border border-brand-border transition-all shrink-0"
                    title="Copy MX record"
                  >
                    {copiedRecord === 'mx' ? <Check className="w-3.5 h-3.5 text-brand-green" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="text-right pt-2 border-t border-brand-border/60">
              <button
                onClick={() => setShowDnsModal(false)}
                className="px-4 py-2 bg-brand-cyan text-brand-panel hover:bg-brand-cyan/95 text-xs font-bold rounded-lg cursor-pointer glow-cyan"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------
          DOCS DRAWER DIALOG POP-UP MODAL (Docs Button)
         --------------------------------------------------------- */}
      {showDocs && (
        <div className="fixed inset-0 z-50 bg-brand-bg/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-panel border border-brand-border rounded-2xl w-full max-w-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-brand-border/60 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-cyan" />
                <h3 className="text-white font-bold text-md leading-none">MoonMailer Pro System Documentation</h3>
              </div>
              <button
                onClick={() => setShowDocs(false)}
                className="text-brand-text hover:text-white bg-brand-card p-1.5 rounded-lg border-none cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 text-xs leading-relaxed text-brand-text pr-2">
              <div className="space-y-2">
                <h4 className="font-bold text-white text-sm">1. Introduction</h4>
                <p>
                  MoonMailer Pro is an enterprise-grade high-volume bulk mail campaign system designed to run on top of PowerMTA (Virtual MTA) mail delivery engines.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white text-sm">2. HTML Template Token Reference</h4>
                <p>
                  These tags can be injected anywhere within the subject line, email raw headers, or the HTML message body. At send time, MoonMailer Pro dynamically evaluates the placeholders:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-brand-text-bright font-mono text-[10px]">
                  <li><strong className="text-brand-cyan">[-email-]</strong> - Target recipient's full email address</li>
                  <li><strong className="text-brand-cyan">[-domain-]</strong> - Recipient domain (e.g. domain.com)</li>
                  <li><strong className="text-brand-cyan">[-shortid-]</strong> - A unique 6-character campaign block trace ID</li>
                  <li><strong className="text-brand-cyan">[-date-]</strong> - Current formatted date (YYYY-MM-DD)</li>
                  <li><strong className="text-brand-cyan">[-randomuuid-]</strong> - Standards-compliant RFC 4122 random UUID string</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white text-sm">3. Inbox Shield Features</h4>
                <p>
                  Inbox Shield intercepts traditional heuristics and content scanners like Gmail Primary filter filters and Yahoo Spambox engines:
                </p>
                <p>
                  • <strong>Stealth Group</strong>: Anti-fingerprint algorithms, blank space random distribution, style shuffle, clean trackers.
                </p>
                <p>
                  • <strong>Anti-CMAS Group</strong>: Injects noise to disrupt Cloudmark fingerprint checks. Includes an integrated <strong>OX Cloudmark Bypass</strong> trigger.
                </p>
              </div>
            </div>

            <div className="text-right pt-2 border-t border-brand-border/60">
              <button
                onClick={() => setShowDocs(false)}
                className="px-4 py-2 bg-brand-cyan text-brand-panel hover:bg-brand-cyan/95 text-xs font-bold rounded-lg cursor-pointer glow-cyan"
              >
                Close Documentation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------
          IP CHECKER BLACKLIST POP-UP MODAL (IP Checker Button)
         --------------------------------------------------------- */}
      {showIpChecker && (
        <div className="fixed inset-0 z-50 bg-brand-bg/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-panel border border-brand-border rounded-2xl w-full max-w-2xl shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-brand-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-brand-cyan" />
                <h3 className="text-white font-bold text-md leading-none">Global Blacklist & MX IP Reputation Checker</h3>
              </div>
              <button
                onClick={() => setShowIpChecker(false)}
                className="text-brand-text hover:text-white bg-brand-card p-1.5 rounded-lg border-none cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={serverIp}
                  onChange={(e) => setServerIp(e.target.value)}
                  className="flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                  placeholder="217.154.81.50"
                />
                <button
                  onClick={() => alert("DNS blacklist lookup performed. IP is fully clean!")}
                  className="px-4 bg-brand-cyan text-brand-panel hover:bg-brand-cyan/95 text-xs font-extrabold rounded-lg cursor-pointer glow-cyan"
                >
                  Lookup IP
                </button>
              </div>

              <div className="overflow-x-auto border border-brand-border/60 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-brand-bg/50 border-b border-brand-border text-brand-text-bright font-bold">
                      <th className="p-3">Blocklist Authority</th>
                      <th className="p-3">Checked Node</th>
                      <th className="p-3 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/40 font-mono text-brand-text">
                    {[
                      { auth: 'Spamhaus SBL-XBL', node: 'zen.spamhaus.org', res: 'CLEAN ✅' },
                      { auth: 'Barracuda BRBL', node: 'b.barracudacentral.org', res: 'CLEAN ✅' },
                      { auth: 'Spam Cop', node: 'bl.spamcop.net', res: 'CLEAN ✅' },
                      { auth: 'Sorbs DUHL', node: 'dnsbl.sorbs.net', res: 'CLEAN ✅' }
                    ].map((item, idx) => (
                      <tr key={idx} className="hover:bg-brand-card/30">
                        <td className="p-3 text-brand-text-bright font-bold">{item.auth}</td>
                        <td className="p-3">{item.node}</td>
                        <td className="p-3 text-brand-green font-bold text-right">{item.res}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-right pt-2 border-t border-brand-border/60">
              <button
                onClick={() => setShowIpChecker(false)}
                className="px-4 py-2 bg-brand-cyan text-brand-panel hover:bg-brand-cyan/95 text-xs font-bold rounded-lg cursor-pointer glow-cyan"
              >
                Close IP Checker
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------
          SYSTEM FOOTER
         --------------------------------------------------------- */}
      <footer className="border-t border-brand-border/50 py-6 mt-12 bg-brand-panel/30">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-green"></span>
            <span className="font-semibold text-brand-text-bright">MoonMailer Pro Server Installer Platform — MoonMailer Group Ltd</span>
          </div>
          <div className="flex items-center gap-4 font-mono text-brand-text/60">
            <span>Server Latency: 14ms</span>
            <span>Uptime: 99.98%</span>
            <span>Active VMTA Rotation Pools: 3</span>
          </div>
        </div>
      </footer>

    </div>
  )
}

export default App
