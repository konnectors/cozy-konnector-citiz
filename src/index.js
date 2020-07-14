const {
  BaseKonnector,
  requestFactory,
  scrape,
  log,
  utils
} = require('cozy-konnector-libs')
const request = requestFactory({
  json: true,
  jar: true
})
const providers = require('../providers.json')

const VENDOR = 'citiz'
const baseUrl = 'https://service.citiz.fr/citiz/api/customer'

module.exports = new BaseKonnector(start)

async function start(fields) {
  const { login, password } = fields
  const { providerId } = providers[fields.providerId]

  log('info', 'Authenticating ...')
  await authenticate.bind(this)(login, password, providerId)
  log('info', 'Successfully logged in')
  // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the list of documents')
  const $ = await request(`${baseUrl}/index.html`)
  // cheerio (https://cheerio.js.org/) uses the same api as jQuery (http://jquery.com/)
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($)

  // Here we use the saveBills function even if what we fetch are not bills,
  // but this is the most common case in connectors
  log('info', 'Saving data to Cozy')
  await this.saveBills(documents, fields, {
    // This is a bank identifier which will be used to link bills to bank operations. These
    // identifiers should be at least a word found in the title of a bank operation related to this
    // bill. It is not case sensitive.
    identifiers: ['books']
  })
}

function authenticate(username, password, providerId) {
  return request({
    uri: `${baseUrl}/login`,
    method: 'POST',
    body: {
      username,
      password,
      providerId
    }
  }).then(resp => {
    if (resp.errorMessage) {
      log('error', resp.errorMessage)
      return false
    } else {
      return true
    }
  })
}

// The goal of this function is to parse a HTML page wrapped by a cheerio instance
// and return an array of JS objects which will be saved to the cozy by saveBills
// (https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#savebills)
function parseDocuments($) {
  // You can find documentation about the scrape function here:
  // https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#scrape
  const docs = scrape(
    $,
    {
      title: {
        sel: 'h3 a',
        attr: 'title'
      },
      amount: {
        sel: '.price_color',
        parse: normalizePrice
      },
      fileurl: {
        sel: 'img',
        attr: 'src',
        parse: src => `${baseUrl}/${src}`
      }
    },
    'article'
  )
  return docs.map(doc => ({
    ...doc,
    // The saveBills function needs a date field
    // even if it is a little artificial here (these are not real bills)
    date: new Date(),
    currency: 'EUR',
    filename: `${utils.formatDate(new Date())}_${VENDOR}_${doc.amount.toFixed(
      2
    )}EUR${doc.vendorRef ? '_' + doc.vendorRef : ''}.jpg`,
    vendor: VENDOR
  }))
}

// Convert a price string to a float
function normalizePrice(price) {
  return parseFloat(price.replace('£', '').trim())
}
