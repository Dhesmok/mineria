const { performance } = require('perf_hooks');

const URLS = [
  'https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/3',
  'https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/4',
  'https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87'
];
const expedientCode = 'HGL-151';

async function fetchMapDataSequential() {
    for (const url of URLS) {
      const params = new URLSearchParams({
        where: `TENURE_ID='${expedientCode}'`,
        outFields: '*',
        f: 'geojson'
      });

      try {
        const response = await fetch(`${url}/query?${params}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.features && data.features.length > 0) {
          return data;
        }
      } catch (error) {

      }
    }

    throw new Error('No se encontraron datos para el expediente especificado en ninguna de las fuentes');
  }

async function fetchMapDataParallel() {
    const controller = new AbortController();
    const { signal } = controller;

    const promises = URLS.map(async (url) => {
      const params = new URLSearchParams({
        where: `TENURE_ID='${expedientCode}'`,
        outFields: '*',
        f: 'geojson'
      });

      const response = await fetch(`${url}/query?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        return data;
      }

      throw new Error(`No valid features found from ${url}`);
    });

    try {
      const result = await Promise.any(promises);
      controller.abort();
      return result;
    } catch (error) {
      throw new Error('No se encontraron datos para el expediente especificado en ninguna de las fuentes');
    }
  }


async function run() {
    const start1 = performance.now();
    try { await fetchMapDataSequential(); } catch (e) {}
    const end1 = performance.now();

    const start2 = performance.now();
    try { await fetchMapDataParallel(); } catch (e) {}
    const end2 = performance.now();

    console.log(`Sequential baseline (simulated): ${end1 - start1} ms`);
    console.log(`Parallel implementation: ${end2 - start2} ms`);
}

run();
