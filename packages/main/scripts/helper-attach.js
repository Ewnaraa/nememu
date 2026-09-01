var attach = function () {
  try {
    var gui = window.gui
    var auth = window.$_authManager
    var account = (auth && auth.account) || (gui && gui.account) || window.$_haapiAccount

    if (gui && gui.playerData && typeof gui.playerData.setLoginName === 'function') {
      window.$_setLoginName = gui.playerData.setLoginName.bind(gui.playerData)
      if (window.parent && window.parent !== window) window.parent.$_setLoginName = window.$_setLoginName
    }

    if (account) {
      if (typeof account.createToken === 'function') {
        window.$_createToken = account.createToken.bind(account)
        if (window.parent && window.parent !== window) window.parent.$_createToken = window.$_createToken

        if (!window.$_createTokenWithParams) {
          window.$_createTokenWithParams = function (params, cb) {
            try {
              var payload = params || {}
              if (!payload.certificate_id && window.$_authCertId) payload.certificate_id = window.$_authCertId
              if (!payload.certificate_hash && window.$_authCertHash) payload.certificate_hash = window.$_authCertHash
              return account.createToken(payload, cb)
            } catch (err) {
              console.error('Nememu createToken failed:', err)
            }
          }
          if (window.parent && window.parent !== window) window.parent.$_createTokenWithParams = window.$_createTokenWithParams
        }
      }

      if (typeof account.createTokenWithCertificate === 'function') {
        window.$_createTokenWithCertificate = account.createTokenWithCertificate.bind(account)
        if (window.parent && window.parent !== window) window.parent.$_createTokenWithCertificate = window.$_createTokenWithCertificate
      }
    }

    var mgr = auth && typeof auth.getHaapiKeyManager === 'function'
      ? auth.getHaapiKeyManager()
      : (window.$_haapiModule && typeof window.$_haapiModule.getHaapiKeyManager === 'function')
        ? window.$_haapiModule.getHaapiKeyManager()
        : null

    if (mgr) {
      if (!window.$_setHaapiKey && typeof mgr.setHaapiKey === 'function') {
        window.$_setHaapiKey = function (apiKey, refreshKey, options) {
          try { mgr.setHaapiKey(apiKey, refreshKey || '', options) } catch (err) { console.error('Nememu setHaapiKey failed:', err) }
        }
        if (window.parent && window.parent !== window) window.parent.$_setHaapiKey = window.$_setHaapiKey
      }

      if (!window.$_getHaapiKey && typeof mgr.getHaapiKey === 'function') {
        window.$_getHaapiKey = function () {
          try { return mgr.getHaapiKey() } catch (err) { console.error('Nememu getHaapiKey failed:', err); return null }
        }
        if (window.parent && window.parent !== window) window.parent.$_getHaapiKey = window.$_getHaapiKey
      }

      if (!window.$_setHaapiAccountId && typeof mgr.setHaapiAccountId === 'function') {
        window.$_setHaapiAccountId = function (id, options) {
          try { mgr.setHaapiAccountId(id, options) } catch (err) { console.error('Nememu setHaapiAccountId failed:', err) }
        }
        if (window.parent && window.parent !== window) window.parent.$_setHaapiAccountId = window.$_setHaapiAccountId
      }

      if (!mgr.$_nememuStoredKeyFallback && typeof mgr.getHaapiKey === 'function') {
        mgr.$_nememuStoredKeyFallback = true
        var originalGetHaapiKey = mgr.getHaapiKey.bind(mgr)

        // The key manager does not always reload the saved credentials on
        // startup, so without this fallback the stored session is invisible to
        // the game and Ankama asks for a fresh emailed code.
        //
        // The refresh token is returned alongside the key on purpose: handing
        // back a key with an empty refresh token left the game unable to renew
        // an expired key, which surfaced as a 401 on Account/CreateToken.
        mgr.getHaapiKey = function () {
          try {
            var keyData = originalGetHaapiKey()
            if (keyData && keyData.key) return keyData

            if (!window.localStorage || typeof window.localStorage.getItem !== 'function') {
              return keyData
            }

            var storedKey = window.localStorage.getItem('HAAPI_KEY')
            if (!storedKey) return keyData

            return {
              key: storedKey,
              refreshToken: window.localStorage.getItem('HAAPI_REFRESH_TOKEN') || ''
            }
          } catch (err) {
            console.error('Nememu stored key fallback failed:', err)
            return null
          }
        }
      }
    }

    if (account && typeof account.createToken === 'function') {
      window.$_haapiDirectLogin = function (opts, cb) {
        try {
          var o = opts || {}
          var localMgr = mgr
          var restoreGet = null
          if (localMgr && typeof localMgr.getHaapiKey === 'function' && o.apiKey) {
            restoreGet = localMgr.getHaapiKey.bind(localMgr)
            localMgr.getHaapiKey = function () {
              return { key: o.apiKey, refreshToken: o.refreshKey || '' }
            }
          }
          if (localMgr) {
            if (o.accountId && localMgr.setHaapiAccountId) localMgr.setHaapiAccountId(o.accountId, { save: o.save !== false })
            if (o.apiKey && localMgr.setHaapiKey) localMgr.setHaapiKey(o.apiKey, o.refreshKey || '', { save: o.save !== false })
          }
          if (o.certificateId) window.$_authCertId = o.certificateId
          if (o.certificateHash) window.$_authCertHash = o.certificateHash
          var payload = Object.assign({}, o.params || {})
          if (!payload.certificate_id && o.certificateId) payload.certificate_id = o.certificateId
          if (!payload.certificate_hash && o.certificateHash) payload.certificate_hash = o.certificateHash
          var done = function (err, res) {
            if (restoreGet && localMgr) localMgr.getHaapiKey = restoreGet
            if (typeof cb === 'function') cb(err, res)
          }
          return account.createToken(payload, done)
        } catch (err) {
          console.error('Nememu haapiDirectLogin failed:', err)
          if (typeof cb === 'function') cb(err)
        }
      }
      if (window.parent && window.parent !== window) window.parent.$_haapiDirectLogin = window.$_haapiDirectLogin
    }

    if (window.$_haapiModule && window.$_haapiModule.loginWithHaapiKey && !window.$_haapiModule.$_nememuPatched) {
      window.$_haapiModule.$_nememuPatched = true
      var haapiModule = window.$_haapiModule
      var keyManager = haapiModule.getHaapiKeyManager && haapiModule.getHaapiKeyManager()

      window.$_primeHaapiKey = function (apiKey, refreshKey, accountId, certificateId, certificateHash) {
        try {
          var km = (haapiModule.getHaapiKeyManager ? haapiModule.getHaapiKeyManager() : null) || keyManager
          if (km) {
            if (accountId && km.setHaapiAccountId) km.setHaapiAccountId(accountId, { save: true })
            if (apiKey && km.setHaapiKey) km.setHaapiKey(apiKey, refreshKey || '', { save: true })
          }
          if (window.localStorage) {
            window.localStorage.setItem('HAAPI_KEY', apiKey || '')
            window.localStorage.setItem('HAAPI_REFRESH_TOKEN', refreshKey || '')
            if (typeof accountId === 'number') {
              window.localStorage.setItem('HAAPI_ACCOUNTID', accountId.toString())
              window.localStorage.setItem(accountId + '_CERTIFICATE_ID', certificateId || '')
              window.localStorage.setItem(accountId + '_CERTIFICATE_HASH', certificateHash || '')
            }
          }
          window.$_authCertId = certificateId || ''
          window.$_authCertHash = certificateHash || ''
          if (window.parent && window.parent !== window) {
            window.parent.$_authCertId = window.$_authCertId
            window.parent.$_authCertHash = window.$_authCertHash
          }
        } catch (err) {
          console.error('Nememu primeHaapiKey failed:', err)
        }
      }

      window.$_finishDirectLogin = function (options) {
        try {
          var manager = haapiModule.getHaapiKeyManager()
          if (!manager || typeof manager.getHaapiAccountId !== 'function') throw new Error('No haapi key manager')
          var accountId = manager.getHaapiAccountId()
          if (!accountId) throw new Error('Missing account id')
          var forcedAccount = options && options.forcedAccount || ''
          window.gui.playerData.setForcedAccount(forcedAccount)
          window.dofus.setCredentials(accountId.toString(), options.token, forcedAccount)
          var loginName = options && (options.loginName || options.account)
          if (loginName) window.gui.playerData.setLoginName(loginName)
          window.gui.splashScreen.show()
          window.dofus.login(function (err, state) {
            if (err) {
              window.dofus.disconnect()
              console.error('Direct login failed', err)
              window.gui.loginScreen.displayAppropriateForm()
              return
            }
            if (state && state.disconnected) {
              window.dofus.disconnect()
              return
            }
            window.gui.initializeAfterLogin(function (initErr) {
              if (initErr) {
                console.error('initializeAfterLogin failed:', initErr)
                window.gui.openSimplePopup(window.gui.getText('ui.popup.connectionFailed.text'))
                window.gui.loginScreen.displayAppropriateForm()
              }
            })
          })
        } catch (err) {
          console.error('finishDirectLogin failed:', err)
          window.gui.loginScreen.displayAppropriateForm()
        }
      }
    }

  } catch (err) {
    console.error('Nememu expose helpers failed:', err)
  }
}
