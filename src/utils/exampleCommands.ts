import {
  getGlobalConfig,
  saveGlobalConfig,
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
} from './config.js'
import { env } from './env.js'
import { getCwd } from './state.js'
import { queryHaiku } from '../services/claude.js'
import { exec } from 'child_process'
import { logError } from './log.js'
import { memoize, sample } from 'lodash-es'
import { promisify } from 'util'
import { getIsGit } from './git.js'

const execPromise = promisify(exec)

async function getFrequentlyModifiedFiles(): Promise<string[]> {
  if (process.env.NODE_ENV === 'test') return []
  if (env.platform === 'windows') return []
  if (!(await getIsGit())) return []

  try {
    let filenames = ''
    // Look up files modified by the user's recent commits
    // Be careful to do it async, so it doesn't block the main thread
    const { stdout: userFilenames } = await execPromise(
      'git log -n 1000 --pretty=format: --name-only --diff-filter=M --author=$(git config user.email) | sort | uniq -c | sort -nr | head -n 20',
      { cwd: getCwd(), encoding: 'utf8' },
    )

    filenames = 'Files modified by user:\n' + userFilenames

    // Look at other users' commits if we don't have enough files
    if (userFilenames.split('\n').length < 10) {
      const { stdout: allFilenames } = await execPromise(
        'git log -n 1000 --pretty=format: --name-only --diff-filter=M | sort | uniq -c | sort -nr | head -n 20',
        { cwd: getCwd(), encoding: 'utf8' },
      )
      filenames += '\n\nFiles modified by other users:\n' + allFilenames
    }
    const response = await queryHaiku({
      systemPrompt: [
        "You are an expert at analyzing git history. Given a list of files and their modification counts, return exactly five filenames that are frequently modified and represent core application logic (not auto-generated files, dependencies, or configuration). Make sure filenames are diverse, not all in the same folder, and are a mix of user and other users. Return only the filenames' basenames (without the path) separated by newlines with no explanation.",
      ],
      userPrompt: filenames,
    })

    const content = response.message.content[0]
    if (!content || content.type !== 'text') return []
    const chosenFilenames = content.text.trim().split('\n')
    if (chosenFilenames.length < 5) {
      // Likely error
      return []
    }
    return chosenFilenames
  } catch (err) {
    logError(err)
    return []
  }
}

export const getExampleCommands = memoize(async (): Promise<string[]> => {
  const globalConfig = getGlobalConfig()
  const projectConfig = getCurrentProjectConfig()
  const now = Date.now()
  const lastGenerated = projectConfig.exampleFilesGeneratedAt ?? 0
  const oneWeek = 7 * 24 * 60 * 60 * 1000

  // Regenerate examples if they're over a week old
  if (now - lastGenerated > oneWeek) {
    projectConfig.exampleFiles = []
  }

  // Update global startup count
  const newGlobalConfig = {
    ...globalConfig,
    numStartups: (globalConfig.numStartups ?? 0) + 1,
  }
  saveGlobalConfig(newGlobalConfig)

  // // If no example files cached, kickstart fetch in background
  // if (!projectConfig.exampleFiles?.length) {
  //   getFrequentlyModifiedFiles().then(files => {
  //     if (files.length) {
  //       saveCurrentProjectConfig({
  //         ...getCurrentProjectConfig(),
  //         exampleFiles: files,
  //         exampleFilesGeneratedAt: Date.now(),
  //       })
  //     }
  //   })
  // }

  const frequentFile = projectConfig.exampleFiles?.length
    ? sample(projectConfig.exampleFiles)
    : '<filepath>'

  return [
    'fix lint errors',
    'fix typecheck errors',
    `how does ${frequentFile} work?`,
    `refactor ${frequentFile}`,
    'how do I log an error?',
    `edit ${frequentFile} to...`,
    `write a test for ${frequentFile}`,
    'create a util logging.py that...',
  ]
})
