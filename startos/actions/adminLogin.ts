import { sdk } from '../sdk'
import { storeJson } from '../fileModels/store.json'
import { ownBaseUrl } from '../utils'

// Shows how to reach the moderation panel and the generated admin password.
export const adminLogin = sdk.Action.withoutInput(
  'admin-login',

  async ({ effects }) => ({
    name: 'Admin Login',
    description: 'Get the moderation panel URL and admin password',
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const password = (await storeJson.read((s) => s.adminPassword).once()) ?? ''
    const adminUrl = `${await ownBaseUrl(effects)}/admin`

    return {
      version: '1' as const,
      title: 'Admin Login',
      message:
        'Open the admin panel to approve, edit, or delete comments. There is no username; log in with the password below.',
      result: {
        type: 'group' as const,
        value: [
          {
            name: 'Admin Panel URL',
            description: null,
            type: 'single' as const,
            value: adminUrl,
            copyable: true,
            qr: false,
            masked: false,
          },
          {
            name: 'Admin Password',
            description: null,
            type: 'single' as const,
            value: password,
            copyable: true,
            qr: false,
            masked: true,
          },
        ],
      },
    }
  },
)
