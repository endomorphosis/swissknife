import { vfsApi } from './api/vfs-api';

async function testVfsApi() {
  console.log('Testing VFS API...');

  try {
    // Test ls command
    const lsResult = await vfsApi.ls('/');
    console.log('ls / result:', lsResult);

    // Test mount command (example, adjust backend and config as needed)
    const mountResult = await vfsApi.mount('memory', '/tmp/test', {});
    console.log('mount result:', mountResult);

    // Test ls again after mount
    const lsTmpResult = await vfsApi.ls('/tmp/test');
    console.log('ls /tmp/test result:', lsTmpResult);

    // Test cp command (requires files to exist, this is just a mock test)
    const cpResult = await vfsApi.cp('/src/file.txt', '/dest/file.txt');
    console.log('cp result:', cpResult);

    // Test sync command
    const syncResult = await vfsApi.sync();
    console.log('sync result:', syncResult);

    console.log('VFS API tests completed.');
  } catch (error) {
    console.error('VFS API test failed:', error);
  }
}

testVfsApi();
