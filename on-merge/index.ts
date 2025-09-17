import { main } from './on-merge';
import * as core from '@actions/core';

main().catch((error) => {
  console.error('An error occurred', error);
  core.setFailed(error.message);
});
