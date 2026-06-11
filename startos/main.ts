import { i18n } from './i18n'
import { sdk } from './sdk'
import { storeJson } from './fileModels/store.json'
import { issoCfg } from './fileModels/issoCfg'
import {
  configDir,
  configSubpath,
  dbDir,
  dbSubpath,
  issoCfgPath,
  ownUiUrls,
  parseWebsites,
  renderIssoCfg,
  uiPort,
} from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info('Starting Isso!')

  const store = await storeJson.read().const(effects)
  if (!store) throw new Error('no store.json')

  // Isso's CORS allowlist: the user's website(s) plus this server's own Tor/LAN
  // addresses (so the /admin panel, served by Isso itself, is allowed too).
  const hosts = [
    ...parseWebsites(store.websites),
    ...(await ownUiUrls(effects)),
  ]
  await issoCfg.write(effects, renderIssoCfg(store, hosts))

  const sub = await sdk.SubContainer.of(
    effects,
    { imageId: 'isso' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'main',
        subpath: dbSubpath,
        mountpoint: dbDir,
        readonly: false,
      })
      .mountVolume({
        volumeId: 'main',
        subpath: configSubpath,
        mountpoint: configDir,
        readonly: true,
      }),
    'isso-sub',
  )

  return sdk.Daemons.of(effects).addDaemon('primary', {
    subcontainer: sub,
    exec: {
      command: sdk.useEntrypoint(),
      env: { ISSO_SETTINGS: issoCfgPath },
    },
    ready: {
      display: i18n('Isso Server'),
      fn: () =>
        sdk.healthCheck.checkWebUrl(
          effects,
          `http://localhost:${uiPort}/info`,
          {
            successMessage: i18n('The Isso server is ready'),
            errorMessage: i18n('The Isso server is starting'),
          },
        ),
    },
    requires: [],
  })
})
