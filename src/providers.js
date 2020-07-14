/* eslint no-console: off */

const request = require('request-promise')
const fs = require('fs')
const path = require('path')

console.log(
  'Getting the list of providers and the corresponding urls and names'
)

request({
  uri: 'https://service.citiz.fr/citiz/api/provider',
  json: true
}).then(providers => {
  if (!providers || !providers.length) {
    throw new Error('Failed to get the list of available providers')
  }

  providers.sort((a, b) => a.shortName.localeCompare(b.shortName))

  const manifestConfig = []
  const byIndex = {}
  let index = 1
  for (const provider of providers) {
    const { shortName } = provider
    const strIndex = index.toString()
    byIndex[strIndex] = provider
    manifestConfig.push({
      name: shortName,
      value: strIndex
    })
    index++
  }

  const providersFilePath = path.join(__dirname, '../providers.json')
  fs.writeFileSync(providersFilePath, JSON.stringify(byIndex, null, 2))

  console.log(`The list of providers is written in ${providersFilePath}`)

  const manifestFilePath = path.join(__dirname, '../manifestConfig.json')
  fs.writeFileSync(manifestFilePath, JSON.stringify(manifestConfig, null, 2))

  console.log(`The manifest configuration is written in ${manifestFilePath}`)
})
