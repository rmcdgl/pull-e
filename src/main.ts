import * as httpm from '@actions/http-client'
import {context, getOctokit} from '@actions/github'
import * as core from '@actions/core'
import {artists} from './artists'

async function generateImage(text: string): Promise<string> {
  const openAIKey = core.getInput('openai-api-token', {required: true})
  const apiUrl = 'https://api.openai.com/v1/images/generations'

  const client = new httpm.HttpClient('pull-e action', [], {
    headers: {Authorization: `Bearer ${openAIKey}`}
  })

  core.debug('Going to generate image')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await client.postJson<any>(apiUrl, {
    prompt: text,
    n: 1,
    response_format: 'url',
    size: '1024x1024'
  })

  core.debug(JSON.stringify(res))
  return res.result.data[0]?.url
}

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', {required: true})
    if (!token) {
      core.setFailed('Unable to retrieve GitHub token')
      return
    }

    const without_style = core.getInput('without-style', {required: false})
    const useStyle = without_style !== 'true'

    const octokit = getOctokit(token)

    const eventName = context.eventName
    const payload = context.payload

    core.debug(`Event name: ${eventName}`)
    if (eventName !== 'pull_request' && eventName !== 'issues') {
      core.setFailed('This action only supports pull_request and issues events')
      return
    }

    const title = payload[`${eventName}`]?.title
    const body = payload[`${eventName}`]?.body
    const issueNumber = payload[`${eventName}`]?.number

    core.debug(`Title: ${title} Body: ${body} Issue Number: ${issueNumber}`)

    // Check if there is already a comment from the bot

    const commentsResponse = await octokit.rest.issues.listComments({
      ...context.repo,
      issue_number: issueNumber
    })

    const existingComment = commentsResponse.data.find(comment =>
      comment?.body?.toLowerCase().endsWith('generated with pull-e')
    )

    if (existingComment) {
      core.info('Comment from PULL-E already exists, skipping')
      return
    }

    if (!title || !issueNumber) {
      core.setFailed(
        'Unable to retrieve required information from the event payload'
      )
      return
    }
    const artist = artists[Math.floor(Math.random() * artists.length)]

    const text = `${
      useStyle ? `A work in the style of ${artist} ` : ''
    }${title}. ${body}`
    const imageUrl = await generateImage(text)

    if (!imageUrl) {
      core.setFailed('Unable to generate image using DALLE-2 API')
      return
    }

    await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: issueNumber,
      body: `![Generated Image](${imageUrl})\n*${
        useStyle
          ? `In the style of ${artist}, generated with PULL-E`
          : 'Generated with PULL-E'
      }*`
    })
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
