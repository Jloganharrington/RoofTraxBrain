import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assembleReportHtml, type PhotoResolver } from './html.js';
import { buildReportData } from './build.js';
import { sampleInspection, sampleConfig } from '../pdf/fixtures.js';

const STUB_TEMPLATE =
  '<html><body><script>\n' +
  'const REPORT_DATA = { placeholder: true };\n' +
  'const sectionMeta = {};\n' +
  'render(REPORT_DATA);\n' +
  '</script></body></html>';

const data = () => buildReportData(sampleInspection, sampleConfig, { generatedAt: new Date('2026-07-19T12:00:00Z') });

// every photo resolves to 1 red pixel
const okResolver: PhotoResolver = async () => ({
  bytes: new Uint8Array([1, 2, 3, 4]),
  contentType: 'image/jpeg',
});

describe('assembleReportHtml', () => {
  test('injects real REPORT_DATA in place of the template demo block', async () => {
    const { html } = await assembleReportHtml(data(), STUB_TEMPLATE, okResolver);
    assert.equal(html.includes('placeholder'), false, 'demo block must be replaced');
    assert.ok(html.includes('const REPORT_DATA = {'));
    assert.ok(html.includes('const sectionMeta = {}'), 'template tail preserved');
    assert.ok(html.includes('2333 Chain Bridge Rd') || html.includes('Fairfax'), 'real address present');
  });

  test('embeds photo bytes as data URIs on photo.src', async () => {
    const { html, embeddedPhotos, missingPhotos } = await assembleReportHtml(data(), STUB_TEMPLATE, okResolver);
    assert.ok(embeddedPhotos > 0);
    assert.deepEqual(missingPhotos, []);
    assert.ok(html.includes('data:image/jpeg;base64,'), 'a data URI is embedded');
  });

  test('a photo the resolver cannot supply is reported, not fatal', async () => {
    const half: PhotoResolver = async (id) =>
      id.endsWith('1') ? { bytes: new Uint8Array([9]), contentType: 'image/jpeg' } : null;
    const { missingPhotos } = await assembleReportHtml(data(), STUB_TEMPLATE, half);
    assert.ok(missingPhotos.length > 0, 'unresolved photos are reported');
    // does not throw — the document still assembles
  });

  test('a template missing the REPORT_DATA seam throws a clear error', async () => {
    await assert.rejects(
      assembleReportHtml(data(), '<html>no data block here</html>', okResolver),
      /missing the injectable REPORT_DATA block/,
    );
  });
});
