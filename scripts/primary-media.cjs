const PRIMARY_MEDIA = Object.freeze([
  'Cable TV',
  'Broadcast TV',
  'Radio',
  'Print',
  'Podcast',
  'Digital Video',
]);

const PRIMARY_MEDIA_SET = new Set(PRIMARY_MEDIA);

function assertPrimaryMedium(value, context = 'layer') {
  if (!PRIMARY_MEDIA_SET.has(value)) {
    throw new Error(
      `${context} has invalid primary medium "${value}". ` +
      `Expected one of: ${PRIMARY_MEDIA.join(', ')}`,
    );
  }
}

module.exports = { PRIMARY_MEDIA, assertPrimaryMedium };