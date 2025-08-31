/**
 * Diff command - Show differences between config and current state
 */

import chalk from 'chalk'
import ora from 'ora'
import { createDiffString } from 'diff'
import { loadConfig } from '../config.js'
import { loadAuth, createClient, validateAuth } from '../auth.js'
import { fetchCurrentState, calculateDiff } from '../state.js'
import type { CLIOptions } from '../types.js'

export async function diffCommand(options: CLIOptions): Promise<void> {
  console.log(chalk.bold.blue('🔍 Inbound Kit - Show Differences\n'))

  try {
    // Load authentication
    const auth = loadAuth(options)
    
    // Validate authentication
    const spinner = ora('Validating authentication...').start()
    const isValid = await validateAuth(auth)
    if (!isValid) {
      spinner.fail('Authentication failed')
      process.exit(1)
    }
    spinner.succeed('Authentication validated')

    // Load configuration
    const { config, configPath, format } = await loadConfig(options.config)
    console.log(chalk.green(`✅ Loaded configuration from ${configPath} (${format})`))

    // Create SDK client
    const client = await createClient(auth)

    // Fetch current state
    const currentState = await fetchCurrentState(client)

    // Calculate differences
    console.log(chalk.blue('🔍 Calculating differences...'))
    const diff = calculateDiff(config, currentState)

    if (!diff.hasChanges) {
      console.log(chalk.green('\n✅ No differences found - configuration is in sync'))
      return
    }

    // Display differences
    console.log(chalk.yellow(`\n📋 Found ${diff.changes.length} differences:\n`))
    
    let createCount = 0
    let updateCount = 0
    let deleteCount = 0

    for (const change of diff.changes) {
      const icon = change.type === 'create' ? '➕' : change.type === 'update' ? '📝' : '🗑️'
      const color = change.type === 'create' ? chalk.green : change.type === 'update' ? chalk.yellow : chalk.red
      
      console.log(color(`${icon} ${change.type.toUpperCase()} ${change.resource}: ${change.key}`))
      
      if (change.reason) {
        console.log(chalk.gray(`   Reason: ${change.reason}`))
      }

      // Show detailed diff for updates
      if (change.type === 'update' && change.current && change.desired) {
        if (options.verbose) {
          console.log(chalk.gray('   Current:'))
          console.log(chalk.gray(`   ${JSON.stringify(change.current, null, 2).split('\n').join('\n   ')}`))
          console.log(chalk.gray('   Desired:'))
          console.log(chalk.gray(`   ${JSON.stringify(change.desired, null, 2).split('\n').join('\n   ')}`))
        }
      }

      // Show what will be created
      if (change.type === 'create' && change.desired) {
        if (options.verbose) {
          console.log(chalk.gray('   Will create:'))
          console.log(chalk.gray(`   ${JSON.stringify(change.desired, null, 2).split('\n').join('\n   ')}`))
        }
      }

      // Show what will be deleted
      if (change.type === 'delete' && change.current) {
        if (options.verbose) {
          console.log(chalk.gray('   Will delete:'))
          console.log(chalk.gray(`   ${JSON.stringify(change.current, null, 2).split('\n').join('\n   ')}`))
        }
      }

      console.log('') // Add spacing between changes

      // Count changes by type
      if (change.type === 'create') createCount++
      else if (change.type === 'update') updateCount++
      else if (change.type === 'delete') deleteCount++
    }

    // Summary
    console.log(chalk.bold('\n📊 Summary:'))
    if (createCount > 0) {
      console.log(chalk.green(`   ➕ ${createCount} resources to be created`))
    }
    if (updateCount > 0) {
      console.log(chalk.yellow(`   📝 ${updateCount} resources to be updated`))
    }
    if (deleteCount > 0) {
      console.log(chalk.red(`   🗑️  ${deleteCount} resources to be deleted`))
    }

    // Show next steps
    console.log(chalk.blue('\n💡 Next steps:'))
    console.log(chalk.blue('   • Run `inbound-kit push` to apply these changes'))
    console.log(chalk.blue('   • Run `inbound-kit push --dry-run` to preview the changes'))
    console.log(chalk.blue('   • Run `inbound-kit push --force` to apply without confirmation'))

  } catch (error) {
    console.error(chalk.red('\n❌ Diff failed:'), error instanceof Error ? error.message : 'Unknown error')
    
    if (options.verbose) {
      console.error(chalk.gray('\nStack trace:'))
      console.error(error)
    }
    
    process.exit(1)
  }
}

/**
 * Create a visual diff between two objects
 */
function createVisualDiff(current: any, desired: any): string {
  const currentStr = JSON.stringify(current, null, 2)
  const desiredStr = JSON.stringify(desired, null, 2)
  
  const diffResult = createDiffString(currentStr, desiredStr)
  
  // Color the diff output
  return diffResult
    .split('\n')
    .map(line => {
      if (line.startsWith('+')) {
        return chalk.green(line)
      } else if (line.startsWith('-')) {
        return chalk.red(line)
      } else {
        return chalk.gray(line)
      }
    })
    .join('\n')
}
