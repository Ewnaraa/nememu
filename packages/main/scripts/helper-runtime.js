;(function () {
  try {
    /* __ATTACH_BODY__ */
    if (!window.$_deExposeLoginAndCert_v2) {
      window.$_deExposeLoginAndCert_v2 = true
      setInterval(attach, 2000)
    }
    attach()
    setTimeout(attach, 0)
    setTimeout(attach, 500)
  } catch (err) {
    console.error('Nememu expose helpers init failed:', err)
  }
})()
