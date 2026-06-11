import { sdk } from '../sdk'
import { storeJson } from '../fileModels/store.json'
import { parseWebsites } from '../utils'

const { InputSpec, Value } = sdk

// Isso parses these as human timedeltas (e.g. 15m, 2h, 7d, 1h30m). Reject
// free text up front so a typo cannot wedge the daemon in a restart loop.
const timedeltaPattern = {
  regex: '^\\s*(\\d+\\s*[smhdw]\\s*)+$',
  description: 'Use a number and unit, e.g. 15m, 2h, 7d, or 1h30m.',
}

const guardSpec = InputSpec.of({
  enabled: Value.toggle({
    name: 'Enable Spam Protection',
    description:
      'Rate-limit comments per IP and apply basic abuse protection. Recommended in production.',
    default: true,
  }),
  ratelimit: Value.number({
    name: 'Rate Limit',
    description: 'Maximum number of new comments allowed per minute per IP.',
    required: true,
    default: 2,
    min: 1,
    max: 60,
    integer: true,
    units: 'per minute',
  }),
  requireAuthor: Value.toggle({
    name: 'Require Name',
    description: 'Force commenters to enter a name (not validated).',
    default: false,
  }),
  requireEmail: Value.toggle({
    name: 'Require Email',
    description: 'Force commenters to enter an email address (not validated).',
    default: false,
  }),
  replyToSelf: Value.toggle({
    name: 'Allow Reply To Self',
    description: 'Let commenters reply to their own comments.',
    default: false,
  }),
})

const smtpSpec = InputSpec.of({
  enabled: Value.toggle({
    name: 'Enable Email Notifications',
    description:
      'Send new-comment notifications (with approve/delete links) via SMTP instead of logging to stdout. Strongly recommended together with moderation.',
    default: false,
  }),
  host: Value.text({
    name: 'SMTP Host',
    required: false,
    default: 'localhost',
  }),
  port: Value.number({
    name: 'SMTP Port',
    required: true,
    default: 587,
    min: 1,
    max: 65535,
    integer: true,
  }),
  security: Value.select({
    name: 'Connection Security',
    default: 'starttls',
    values: { none: 'None', starttls: 'STARTTLS', ssl: 'SSL/TLS' },
  }),
  username: Value.text({
    name: 'Username',
    required: false,
    default: null,
  }),
  password: Value.text({
    name: 'Password',
    required: false,
    default: null,
    masked: true,
  }),
  from: Value.text({
    name: 'From Address',
    description: 'Sender address, e.g. "Comments" <isso@example.com>.',
    required: false,
    default: null,
  }),
  to: Value.text({
    name: 'To Address',
    description: 'Where notifications are delivered, e.g. you@example.com.',
    required: false,
    default: null,
  }),
})

const inputSpec = InputSpec.of({
  websites: Value.textarea({
    name: 'Websites',
    description:
      "The website(s) allowed to embed and load comments (Isso's CORS allowlist). Enter one origin per line, including the scheme, e.g. https://blog.example.com/. At least one is required for comments to work.",
    required: true,
    default: null,
    placeholder: 'https://blog.example.com/',
  }),
  moderationEnabled: Value.toggle({
    name: 'Comment Moderation',
    description:
      'Hold new comments in a queue until you approve them in the admin panel. Recommended.',
    default: true,
  }),
  adminEnabled: Value.toggle({
    name: 'Admin Panel',
    description:
      'Enable the web moderation panel at /admin (login with the admin password from the Admin Login action).',
    default: true,
  }),
  maxAge: Value.text({
    name: 'Edit Window',
    description:
      'How long a visitor may edit or delete their own comment after posting, e.g. 15m, 2h, 7d.',
    required: true,
    default: '15m',
    patterns: [timedeltaPattern],
  }),
  purgeAfter: Value.text({
    name: 'Purge Unapproved Comments After',
    description:
      'Remove still-unapproved comments from the moderation queue after this period, e.g. 30d.',
    required: true,
    default: '30d',
    patterns: [timedeltaPattern],
  }),
  replyNotifications: Value.toggle({
    name: 'Reply Notifications',
    description:
      'Let visitors subscribe to email notifications for replies to their comment. Enable moderation too, to avoid spam abuse.',
    default: false,
  }),
  gravatar: Value.toggle({
    name: 'Gravatar Avatars',
    description: 'Show Gravatar profile images next to comments.',
    default: false,
  }),
  latestEnabled: Value.toggle({
    name: 'Enable /latest Endpoint',
    description:
      'Serve the /latest endpoint that returns recent comments across all threads.',
    default: false,
  }),
  guard: Value.object(
    {
      name: 'Spam Protection',
      description: 'Rate limiting and comment requirements.',
    },
    guardSpec,
  ),
  smtp: Value.object(
    {
      name: 'Email Notifications (SMTP)',
      description: 'Optional SMTP settings for new-comment notifications.',
    },
    smtpSpec,
  ),
})

export const configure = sdk.Action.withInput(
  'configure',

  async ({ effects }) => ({
    name: 'Configure',
    description: 'Configure Isso commenting settings',
    warning: 'Saving changes restarts the Isso server.',
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  // Prefill the form with the current settings.
  async ({ effects }) => {
    const s = await storeJson.read().once()
    if (!s) return {}
    return {
      websites: s.websites || undefined,
      moderationEnabled: s.moderationEnabled,
      adminEnabled: s.adminEnabled,
      maxAge: s.maxAge,
      purgeAfter: s.purgeAfter,
      replyNotifications: s.replyNotifications,
      gravatar: s.gravatar,
      latestEnabled: s.latestEnabled,
      guard: {
        enabled: s.guard.enabled,
        ratelimit: s.guard.ratelimit,
        requireAuthor: s.guard.requireAuthor,
        requireEmail: s.guard.requireEmail,
        replyToSelf: s.guard.replyToSelf,
      },
      smtp: {
        enabled: s.smtp.enabled,
        host: s.smtp.host,
        port: s.smtp.port,
        security: s.smtp.security,
        username: s.smtp.username || undefined,
        password: s.smtp.password || undefined,
        from: s.smtp.from || undefined,
        to: s.smtp.to || undefined,
      },
    }
  },

  async ({ effects, input }) => {
    const websites = parseWebsites(input.websites)
    if (websites.length === 0) {
      throw new Error('Enter at least one website origin.')
    }

    if (input.smtp.enabled) {
      if (!input.smtp.to?.trim()) {
        throw new Error('Enter a To Address to enable email notifications.')
      }
      if (!input.smtp.from?.trim()) {
        throw new Error('Enter a From Address to enable email notifications.')
      }
    }

    await storeJson.merge(effects, {
      websites: websites.join('\n'),
      moderationEnabled: input.moderationEnabled,
      adminEnabled: input.adminEnabled,
      maxAge: input.maxAge.trim(),
      purgeAfter: input.purgeAfter.trim(),
      replyNotifications: input.replyNotifications,
      gravatar: input.gravatar,
      latestEnabled: input.latestEnabled,
      guard: {
        enabled: input.guard.enabled,
        ratelimit: input.guard.ratelimit,
        requireAuthor: input.guard.requireAuthor,
        requireEmail: input.guard.requireEmail,
        replyToSelf: input.guard.replyToSelf,
      },
      smtp: {
        enabled: input.smtp.enabled,
        host: input.smtp.host ?? 'localhost',
        port: input.smtp.port,
        security: input.smtp.security,
        username: input.smtp.username ?? '',
        password: input.smtp.password ?? '',
        from: input.smtp.from ?? '',
        to: input.smtp.to ?? '',
      },
    })

    await effects.restart()

    return {
      version: '1' as const,
      title: 'Settings Saved',
      message:
        'Isso is restarting with the new settings. Use the Embed Code action to add comments to your site.',
      result: null,
    }
  },
)
