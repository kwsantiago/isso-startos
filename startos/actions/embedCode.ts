import { sdk } from '../sdk'
import { ownUiUrls } from '../utils'

// Shows the HTML snippet to paste into a page to render Isso comments, plus the
// server's address(es) for reference.
export const embedCode = sdk.Action.withoutInput(
  'embed-code',

  async ({ effects }) => ({
    name: 'Embed Code',
    description: 'Get the HTML snippet to add comments to your website',
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const urls = await ownUiUrls(effects)
    const base = (urls[0] ?? 'http://localhost').replace(/\/$/, '')

    const snippet =
      `<script data-isso="${base}/"\n` +
      `        src="${base}/js/embed.min.js"></script>\n` +
      `<section id="isso-thread"></section>`

    const addresses = urls.length
      ? urls.map((u) => u.replace(/\/$/, '')).join('\n')
      : '(no addresses available yet — start the server first)'

    return {
      version: '1' as const,
      title: 'Embed Code',
      message:
        "Paste the snippet below into any page where you want comments to appear. Make sure that page's origin is listed under Websites in the Configure action.",
      result: {
        type: 'group' as const,
        value: [
          {
            name: 'HTML Snippet',
            description: 'Place where comments should appear on your page.',
            type: 'single' as const,
            value: snippet,
            copyable: true,
            qr: false,
            masked: false,
          },
          {
            name: 'Server Address(es)',
            description: 'Isso is reachable at these addresses.',
            type: 'single' as const,
            value: addresses,
            copyable: false,
            qr: false,
            masked: false,
          },
        ],
      },
    }
  },
)
