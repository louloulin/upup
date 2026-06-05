/**
 * @upup/index-app - L7 Application Shell
 *
 * Thin entry point that delegates to @upup/cli.
 * All business logic lives in lower-layer packages.
 */
import 'dotenv/config';
import { runCli } from '@upup/cli';

runCli();
