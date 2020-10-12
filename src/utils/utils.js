'use strict'
const fs = require('fs-extra')
const path = require('path')
const yaml = require('js-yaml')
const stream = require('stream')
const ProgressBar = require('progress')
const progress = require('progress-stream')

const { green, white, red } = require('colors')

const SERVICE_TYPE = 'Aliyun::Serverless::Service'
const CUSTOM_DOMAIN_TYPE = 'Aliyun::Serverless::CustomDomain'

function getTemplateFile (fullOutputDir) {
  const doGetTemplateFile = fileName => {
    const templateFilePath = path.resolve(fullOutputDir, fileName)
    if (fs.existsSync(templateFilePath)) {
      const defautContent = getTemplateHeader()
      let content = yaml.safeLoad(fs.readFileSync(templateFilePath, 'utf8'))
      if (content) {
        if (content.ROSTemplateFormatVersion === undefined) {
          throw new Error(red('The template file format in the current directory is incorrect.'))
        }
        content.Resources = content.Resources || defautContent.Resources
        content.ROSTemplateFormatVersion = content.ROSTemplateFormatVersion || defautContent.ROSTemplateFormatVersion
        if (typeof content.Transform === 'string') {
          if (content.Transform !== defautContent.Transform) {
            content.Transform = [content.Transform, defautContent.Transform]
          }
        } else if (Array.isArray(content.Transform)) {
          if (!content.Transform.includes(defautContent.Transform)) {
            content.Transform.push(defautContent.Transform)
          }
        } else {
          content.Transform = defautContent.Transform
        }
      } else {
        content = defautContent
      }
      return {
        templateFilePath,
        content
      }
    }
  }
  const result = doGetTemplateFile('template.yml')
  if (result) {
    return result
  }
  return doGetTemplateFile('template.yaml')
}

function doProp (target, propertyName, value) {
  if (!target) {
    return
  }
  if (value) {
    target[propertyName] = value
  }
}

function getCodeUri (serviceName, functionName) {
  return `./${serviceName}/${functionName}`
}

function createProgressBar (format, options) {
  const opts = Object.assign({
    complete: green('█'),
    incomplete: white('█'),
    width: 20,
    clear: true
  }, options)
  const bar = new ProgressBar(format, opts)
  const old = bar.tick
  const loadingChars = ['⣴', '⣆', '⢻', '⢪', '⢫']
  bar.tick = (len, tokens) => {
    const newTokens = Object.assign({
      loading: loadingChars[parseInt(Math.random() * 5)]
    }, tokens)
    old.call(bar, len, newTokens)
  }
  return bar
}

function checkResource (resourceName, content) {
  const resource = content.Resources[resourceName]
  if (resource) {
    if (resource.Type === SERVICE_TYPE) {
      throw new Error(red(`The service that needs to be imported already exists: ${resourceName}.`))
    }
    if (resource.Type === CUSTOM_DOMAIN_TYPE) {
      throw new Error(red(`The custom domain that needs to be imported already exists: ${resourceName}.`))
    }
    throw new Error(red(`The resource that needs to be imported already exists: ${resourceName}, type: ${resource.Type}.`))
  }
}

function outputTemplateFile (templateFilePath, content) {
  fs.writeFileSync(templateFilePath, yaml.safeDump(content))
}

function getTemplateHeader () {
  return {
    ROSTemplateFormatVersion: '2015-09-01',
    Transform: 'Aliyun::Serverless-2018-04-03',
    Resources: {}
  }
}

function readableStreamInstance (paramsBuffer) {
  let current = 0
  return new stream.Readable({
    read (size) {
      if (current + size >= paramsBuffer.length) { size = paramsBuffer.length - current }

      this.push(paramsBuffer.slice(current, current + size))

      current += size

      if (current >= paramsBuffer.length) { this.push(null) }
    }
  })
}

function uploadProgress (params) {
  const parmasStr = JSON.stringify(params)
  const paramsBuffer = Buffer.from(parmasStr)

  const readableStream = readableStreamInstance(paramsBuffer)

  if (!process.stdin.isTTY) {
    return readableStream
  }

  const str = progress({
    time: 500,
    length: parmasStr.length
  })

  const total = Math.round(paramsBuffer.length / 1024)

  const bar = createProgressBar(`${green(':uploading')} :bar :current/:total :rate KB/s, :percent :etas`, { total })

  str.on('progress', (progress) => {
    bar.tick(Math.round(progress.delta / 1024)) // Δ
  })

  return readableStream.pipe(str)
}

module.exports = {
  getTemplateFile,
  getCodeUri,
  createProgressBar,
  checkResource,
  doProp,
  outputTemplateFile,
  getTemplateHeader,
  uploadProgress
}
