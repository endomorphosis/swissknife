// web/test-compilation.ts
console.log('Testing compilation of SwissKnife core modules...');

// Level 1: Pure utilities (should work)
try {
  // Test if these exist and can be imported
  import('../src/utils/array').then(module => {
    console.log('✅ Utils/array compiled successfully');
  }).catch(err => {
    console.log('❌ Utils/array failed:', err.message);
  });
  
  import('../src/constants/models').then(module => {
    console.log('✅ Constants/models compiled successfully');
  }).catch(err => {
    console.log('❌ Constants/models failed:', err.message);
  });
} catch (error) {
  console.log('❌ Level 1 imports failed:', error);
}

// Level 2: Core logic (may need polyfills)
try {
  import('../src/cost-tracker').then(module => {
    console.log('✅ Cost tracker compiled successfully');
    // Test basic functionality
    if (typeof module.addToTotalCost === 'function') {
      console.log('✅ Cost tracker functions available');
    }
  }).catch(err => {
    console.log('❌ Cost tracker failed:', err.message);
  });
} catch (error) {
  console.log('❌ Level 2 imports failed:', error);
}

// Level 3: Complex modules (likely to need adaptation)
try {
  import('../src/ai/types').then(module => {
    console.log('✅ AI types compiled successfully');
  }).catch(err => {
    console.log('❌ AI types failed:', err.message);
  });
  
  import('../src/ai/service').then(module => {
    console.log('✅ AI service compiled successfully');
  }).catch(err => {
    console.log('❌ AI service failed:', err.message);
  });
} catch (error) {
  console.log('❌ Level 3 imports failed:', error);
}

export {};
