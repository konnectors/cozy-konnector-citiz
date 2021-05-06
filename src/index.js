process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://06ba8bb3cf0047b2ad1ee70014d966b6@sentry.cozycloud.cc/140'

const {
  BaseKonnector,
  requestFactory,
  log,
  utils
} = require('cozy-konnector-libs')
const request = requestFactory({
  //debug: true,
  json: true,
  jar: true
})
const providers = require('../providers.json')
const baseUrl = 'https://service.citiz.fr/citiz/api/customer'

const VENDOR = 'citiz'


module.exports = new BaseKonnector(start)

async function start(fields) {
  const { login, password } = fields
  const { providerId } = providers[fields.providerId]
  const ctx = { providerId }
  log('debug', `Provider in account is : ${fields.providerId}`)

  log('info', 'Authenticating ...')
  await authenticate.bind(this)(login, password, providerId)
  log('info', 'Successfully logged in')

  log('info', 'Authorizing the current user')

  const uri = `https://service.citiz.fr/citiz/authentication`

  const { access_token, token_type } = await request({
    uri,
    method: 'POST',
    form: {
      userName: `mobile.worker.${providerId}`,
      password: 'Mo83Wo76!',
      grant_type: 'password'
    }
  })
  const Authorization = `${token_type} ${access_token}`

  log('info', 'Fetching the user info')
  const usersSettings = await request({
    uri: `${baseUrl}/${login}/settings`,
    headers: { Authorization }
  })
  if (!usersSettings.results || !usersSettings.results.length) {
    log('error', usersSettings)
  }
  // We take the first user but this could be different for other people.
  // To be updated.
  const userSettings = usersSettings.results[0]
  ctx.token = userSettings.token
  ctx.customerId = userSettings.customerId

  log('info', 'Fetching the list of invoices')
  const invoices = await fetchInvoices(ctx)

  log('info', 'Parsing list of invoices')
  const documents = await parseInvoices(ctx, invoices)

  log('info', 'Saving data to Cozy')
  await this.saveBills(documents, fields, {
    identifiers: ['autopartage'],
    contentType: 'application/pdf'
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

async function fetchInvoices({ providerId, customerId, token }) {
  return (
    (await request({
      uri: `${baseUrl}/${customerId}/invoices`,
      qs: { token, providerId }
    }))
      // Citiz invoices per month and closes it at the end so we fetch only these
      .filter(invoice => invoice.closed)
      .sort((a, b) => {
        // We sort by ascending invoice date so that credit earned can be applied
        // to later bills.
        if (a.invoiceDate < b.invoiceDate) return -1
        if (b.invoiceDate < a.invoiceDate) return 1
        return 0
      })
  )
}

function parseInvoices(ctx, invoices) {
  const { providerId, customerId, token } = ctx
  ctx.credit = 0
  return invoices.map(
    ({ period, invoicedAmount, invoiceId, invoiceNo, invoiceDate }) => {
      return {
        title: period,
        amount: computeAmount(ctx, invoicedAmount),
        fileurl: `${baseUrl}/${customerId}/invoices/${invoiceId}`,
        requestOptions: { qs: { token, providerId } },
        date: new Date(`${invoiceDate}Z`),
        currency: 'EUR',
        filename: `${utils.formatDate(
          new Date(`${invoiceDate}Z`)
        )}_${VENDOR}_${invoicedAmount.toFixed(2)}EUR_${invoiceNo}.pdf`,
        vendor: VENDOR
      }
    }
  )
}

function computeAmount(ctx, invoicedAmount) {
  // Apply earned credit to invoiced amount
  const diff = invoicedAmount - ctx.credit
  // We save the new credit value to either 0 or the remaining credit if it was
  // greater than the invoiced amount.
  ctx.credit = Math.max(-diff, 0)

  // If the credit covers the entire invoiced amount, there won't be any debit
  // operations so the amount is 0.
  return Math.max(diff, 0)
}
