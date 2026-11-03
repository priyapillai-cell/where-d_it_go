// Background tasks must be defined in the global scope before the app root mounts,
// because the OS can launch the JS runtime headlessly just to run them.
import './src/services/backgroundTasks';
import 'expo-router/entry';
