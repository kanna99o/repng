require('babel-register')({
  plugins: ['babel-plugin-transform-runtime'].map(require.resolve),
  presets: [
    'babel-preset-env',
    'babel-preset-stage-0',
    'babel-preset-react'
  ].map(require.resolve)
})

const fs = require('fs')
const puppeteer = require('puppeteer')
const { Readable } = require('stream')
const path = require('path')
const { createElement: h } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const Datauri = require('datauri')
const resolveCWD = require('resolve-cwd')

const baseCSS = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif}`

const getHtmlData = ({ body, baseCSS, css, styles, webfont }) => {
  const fontCSS = webfont ? getWebfontCSS(webfont) : ''
  const html = `<!DOCTYPE html>
    <head>
    <meta charset="utf-8"><style>${baseCSS}${fontCSS}${css}</style>
    ${styles}
    </head>
    ${body}`
  const htmlBuffer = Buffer.from(html, 'utf8')
  const datauri = new Datauri()
  datauri.format('.html', htmlBuffer)
  const data = datauri.content
  return data
}

const getWebfontCSS = (fontpath) => {
  const { content } = new Datauri(fontpath)
  const [name, ext] = fontpath
    .split('/')
    .slice(-1)[0]
    .split('.')
  const css = `@font-face {
  font-family: '${name}';
  font-style: normal;
  font-weight: 400;
  src: url(${content});
}`
  return css
}

module.exports = async (Component, opts = {}) => {
  const {
    props = {},
    css = '',
    puppeteer: puppeteerOptions = {},
    filename,
    outDir,
    width,
    height,
    scale = 1,
    webfont,
    cssLibrary
  } = opts

  let body
  let styles = ''
  const el = h(Component, props)
  switch (cssLibrary) {
    case 'styled-components':
      const { ServerStyleSheet } = require(resolveCWD('styled-components'))
      const sheet = new ServerStyleSheet()
      body = renderToStaticMarkup(sheet.collectStyles(el))
      styles = sheet.getStyleTags()
      break
    case 'emotion':
      const { renderStylesToString } = require(resolveCWD('emotion-server'))
      body = renderStylesToString(renderToString(el))
      break
    default:
      body = renderToStaticMarkup(el)
  }

  const data = getHtmlData({
    body,
    baseCSS,
    css,
    styles,
    webfont
  })

    // measuring time in each part of the screenshot creation process

  // open browser
  const openBrowserStartTime = process.hrtime()
  const browser = await puppeteer.launch(puppeteerOptions)
  const openBrowserEndTime = process.hrtime(openBrowserStartTime)
  console.log(`Open Browser execution time: ${openBrowserEndTime[1]/1000000} ms`)
  
  // open new browser page
  const pagebrowserStartTime = process.hrtime()
  const page = await browser.newPage()
  const pagebrowserEndTime = process.hrtime(pagebrowserStartTime)
  console.log(`Open browser page execution time: ${pagebrowserEndTime[1]/1000000} ms`)

  // pass data to browser page
  const dataPassStartTime = process.hrtime()
  await page.goto(data)
  const datapassEndTime = process.hrtime(dataPassStartTime)
  console.log(`Pass data to page execution time: ${datapassEndTime[1]/1000000} ms`)

  // set page viewport
  const setPageViewPortStartTime = process.hrtime()
  await page.setViewport({ width: parseInt(width) * scale, height: parseInt(height) * scale })
  const setPageViewPortEndTime = process.hrtime(setPageViewPortStartTime)
  console.log(`Set page viewport execution time: ${setPageViewPortEndTime[1]/1000000} ms`)
  
  // probando: escalamiento de pagina para acelerar toma  del screenshot 
  await page.evaluate(function(factor) {
    var root = document.querySelector('html')
  
    root.style.transform='scale(' + factor + ')'
    root.style.transformOrigin='top left'
  }, scale)

  // generate screenshoot
  const generateScreenShootStartTime = process.hrtime()
  const result = await page.screenshot({
    type: 'png',
    clip: {
      x: 0,
      y: 0,
      width: parseInt(width) * scale,
      height: parseInt(height) * scale
    },
    omitBackground: true
  })
  const generateScreenShootEndTime = process.hrtime(generateScreenShootStartTime);
  console.log(`Generate Screenshoot execution time: ${generateScreenShootEndTime[1]/1000000} ms`)

  // close browser
  const browserCloseStartTime = process.hrtime()
  await browser.close()
  const browserCloseEndTime = process.hrtime(browserCloseStartTime)
  console.log(`Browser close execution time: ${browserCloseEndTime[1]/1000000} ms`)

  return result
}
