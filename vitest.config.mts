export default {
  test: {
    include: ['test/**/*.test.ts'],
    // Each file starts its own fake Formstep API and points FORMSTEP_API_URL at it.
    fileParallelism: false,
  },
}
