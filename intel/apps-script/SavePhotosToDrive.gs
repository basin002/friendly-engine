/**
 * MachineIntel — Gmail attachment harvester
 *
 * Saves equipment photos and spec sheets out of Gmail into organised Drive
 * folders, and writes an index sheet so the data can be read and cross-
 * referenced later.
 *
 * Runs on a schedule. Safe to re-run: every message it handles gets a Gmail
 * label, and labelled messages are excluded from the next search, so nothing
 * is ever processed or duplicated twice.
 *
 * SETUP: run setUp() once. It creates the Drive folder, the index sheet, the
 * Gmail label, and an hourly trigger. Nothing else to configure.
 */

const CONFIG = {
  // Drive folder created at the top level of My Drive.
  ROOT_FOLDER_NAME: 'MachineIntel',

  // Index spreadsheet, created inside the root folder.
  INDEX_SHEET_NAME: 'MachineIntel Photo Index',

  // Gmail label applied to processed messages. Doubles as the skip filter.
  PROCESSED_LABEL: 'Intel-PhotosSaved',

  // How far back to reach on the first pass. Later runs only see new mail
  // because processed messages are labelled and excluded.
  LOOKBACK: '2y',

  // Senders that only ever send automated noise. Their attachments are
  // reports and tracking pixels, not equipment.
  EXCLUDE_SENDERS: [
    'noreply@actsoftworkforcemanager.com',
    'admin@machiniosystem.com',
    'calendar-notification@google.com',
    'postmaster',
    'mailer-daemon',
    'no-reply@accounts.google.com',
  ],

  // Attachment types worth keeping. Images are equipment photos; PDFs are
  // usually spec sheets, manuals, or nameplate scans.
  KEEP_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp',
    'image/tiff',
    'application/pdf',
  ],

  // Anything smaller than this is almost certainly an email signature logo,
  // a tracking pixel, or an icon. Real photos from a phone are 1 MB+.
  MIN_BYTES: 40 * 1024,

  // Skip absurdly large files so one 200 MB video can't stall a run.
  MAX_BYTES: 30 * 1024 * 1024,

  // Filenames that are always junk regardless of size.
  JUNK_NAME_PATTERNS: [
    /^image00\d+\.(png|jpg|jpeg|gif)$/i,   // Outlook signature images
    /^~WRD\d+\.(jpg|png)$/i,               // Word artefacts
    /^oledata\.mso$/i,
    /^logo/i,
    /^signature/i,
    /^banner/i,
    /beacon/i,
  ],

  // Threads per run. Kept low because Apps Script stops each execution at
  // 6 minutes; the label means the next run resumes where this one stopped.
  MAX_THREADS_PER_RUN: 40,

  // Stop gracefully before Apps Script kills the execution mid-write.
  TIME_BUDGET_MS: 4.5 * 60 * 1000,
};

const INDEX_HEADERS = [
  'saved_at',
  'email_date',
  'sender_email',
  'sender_domain',
  'internal',
  'subject',
  'thread_id',
  'message_id',
  'original_filename',
  'mime_type',
  'size_bytes',
  'drive_file_id',
  'drive_url',
  'readable_by_agent',
  'photo_type',
  'company_id',
  'machine_id',
  'extracted_notes',
];

const INTERNAL_DOMAINS = ['rrmachinerymoving.com', 'sourcemachinerysales.com'];

/**
 * Run this once. Creates everything and schedules the job.
 */
function setUp() {
  const root = getOrCreateRootFolder_();
  const sheet = getOrCreateIndexSheet_(root);
  getOrCreateLabel_();

  // Remove any previous trigger for this script so setUp() is safe to re-run.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'harvest') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('harvest').timeBased().everyHours(1).create();

  const msg = [
    'Setup complete.',
    '',
    'Drive folder: ' + root.getUrl(),
    'Index sheet:  ' + sheet.getParent().getUrl(),
    'Gmail label:  ' + CONFIG.PROCESSED_LABEL,
    '',
    'An hourly trigger is now running harvest().',
    'Run harvest() manually once now if you want to start immediately.',
  ].join('\n');

  Logger.log(msg);
  return msg;
}

/**
 * The main job. Finds unprocessed mail with worthwhile attachments, files
 * them into Drive by sender domain, and appends a row per file to the index.
 */
function harvest() {
  const started = Date.now();
  const root = getOrCreateRootFolder_();
  const sheet = getOrCreateIndexSheet_(root);
  const label = getOrCreateLabel_();

  const threads = GmailApp.search(buildQuery_(), 0, CONFIG.MAX_THREADS_PER_RUN);
  Logger.log('Threads to examine: ' + threads.length);

  const rows = [];
  let filesSaved = 0;
  let threadsHandled = 0;

  for (let t = 0; t < threads.length; t++) {
    if (Date.now() - started > CONFIG.TIME_BUDGET_MS) {
      Logger.log('Time budget reached — stopping cleanly. Next run resumes here.');
      break;
    }

    const thread = threads[t];
    const messages = thread.getMessages();

    for (let m = 0; m < messages.length; m++) {
      const message = messages[m];

      // includeInlineImages:false is what keeps signature logos out.
      const attachments = message.getAttachments({
        includeInlineImages: false,
        includeAttachments: true,
      });
      if (!attachments.length) continue;

      const senderEmail = extractEmail_(message.getFrom());
      const domain = senderEmail.split('@')[1] || 'unknown';
      if (isExcludedSender_(senderEmail)) continue;

      const folder = getOrCreateChildFolder_(root, domain);
      const emailDate = message.getDate();
      const datePrefix = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const msgIdShort = message.getId().slice(-8);

      for (let a = 0; a < attachments.length; a++) {
        const att = attachments[a];
        if (!isWorthKeeping_(att)) continue;

        const safeName = datePrefix + '_' + msgIdShort + '_' + sanitise_(att.getName());

        let file;
        try {
          file = folder.createFile(att.copyBlob().setName(safeName));
        } catch (err) {
          Logger.log('Could not save ' + att.getName() + ': ' + err);
          continue;
        }

        const mime = att.getContentType();
        rows.push([
          new Date(),
          emailDate,
          senderEmail,
          domain,
          INTERNAL_DOMAINS.indexOf(domain) !== -1 ? 'yes' : 'no',
          message.getSubject(),
          thread.getId(),
          message.getId(),
          att.getName(),
          mime,
          att.getSize(),
          file.getId(),
          file.getUrl(),
          agentReadable_(mime),
          '', // photo_type — filled in later by review
          '', // company_id
          '', // machine_id
          '', // extracted_notes
        ]);
        filesSaved++;
      }
    }

    thread.addLabel(label);
    threadsHandled++;
  }

  if (rows.length) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, INDEX_HEADERS.length)
      .setValues(rows);
  }

  const summary =
    'Threads handled: ' + threadsHandled + ' · files saved: ' + filesSaved;
  Logger.log(summary);
  return summary;
}

/**
 * Undo helper. Removes the processed label from everything so the next run
 * re-examines all mail. Does NOT delete saved files or index rows — clear
 * those manually first if you want a genuinely clean re-run.
 */
function resetProcessedLabel() {
  const label = getOrCreateLabel_();
  let threads = label.getThreads(0, 200);
  let removed = 0;
  while (threads.length) {
    threads.forEach(function (th) {
      th.removeLabel(label);
      removed++;
    });
    threads = label.getThreads(0, 200);
  }
  Logger.log('Label removed from ' + removed + ' threads.');
  return removed;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function buildQuery_() {
  const parts = [
    'has:attachment',
    'newer_than:' + CONFIG.LOOKBACK,
    '-label:' + CONFIG.PROCESSED_LABEL,
    '-in:spam',
    '-in:trash',
  ];
  CONFIG.EXCLUDE_SENDERS.forEach(function (s) {
    parts.push('-from:' + s);
  });
  return parts.join(' ');
}

function isExcludedSender_(email) {
  const lower = email.toLowerCase();
  return CONFIG.EXCLUDE_SENDERS.some(function (s) {
    return lower.indexOf(s.toLowerCase()) !== -1;
  });
}

function isWorthKeeping_(att) {
  const size = att.getSize();
  if (size < CONFIG.MIN_BYTES || size > CONFIG.MAX_BYTES) return false;

  const mime = (att.getContentType() || '').toLowerCase().split(';')[0];
  if (CONFIG.KEEP_TYPES.indexOf(mime) === -1) return false;

  const name = att.getName() || '';
  if (CONFIG.JUNK_NAME_PATTERNS.some(function (re) { return re.test(name); })) {
    return false;
  }
  return true;
}

/**
 * The Drive tools an agent uses can read JPEG, PNG and PDF directly. HEIC
 * from iPhones and a few other formats need converting first, so they are
 * flagged in the index rather than silently ignored.
 */
function agentReadable_(mime) {
  const readable = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  return readable.indexOf((mime || '').toLowerCase().split(';')[0]) !== -1
    ? 'yes'
    : 'needs conversion';
}

function extractEmail_(from) {
  const match = /<([^>]+)>/.exec(from);
  return (match ? match[1] : from).trim().toLowerCase();
}

function sanitise_(name) {
  return (name || 'unnamed').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
}

function getOrCreateRootFolder_() {
  const existing = DriveApp.getRootFolder().getFoldersByName(CONFIG.ROOT_FOLDER_NAME);
  return existing.hasNext()
    ? existing.next()
    : DriveApp.getRootFolder().createFolder(CONFIG.ROOT_FOLDER_NAME);
}

function getOrCreateChildFolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parent.createFolder(name);
}

function getOrCreateLabel_() {
  return (
    GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL) ||
    GmailApp.createLabel(CONFIG.PROCESSED_LABEL)
  );
}

function getOrCreateIndexSheet_(root) {
  const existing = root.getFilesByName(CONFIG.INDEX_SHEET_NAME);
  let ss;
  if (existing.hasNext()) {
    ss = SpreadsheetApp.open(existing.next());
  } else {
    ss = SpreadsheetApp.create(CONFIG.INDEX_SHEET_NAME);
    // SpreadsheetApp.create() lands in My Drive root; move it into place.
    const file = DriveApp.getFileById(ss.getId());
    root.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }

  const sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(INDEX_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, INDEX_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}
