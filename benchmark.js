const layerNumbers = {
  "Título Vigente": 1,
  "Solicitud Vigente": 2
};

const layers = [
  {
    url: `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/1/query`,
  },
  {
    url: "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3/query",
  },
  {
    url: `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/2/query`,
  },
  {
    url: "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87/query",
  },
];

const normalizedCode = "HJB-082".toUpperCase();

async function runSequential() {
  const start = Date.now();
  for (const layer of layers) {
    const queries = [
      `UPPER(TENURE_ID)='${normalizedCode}'`,
      `UPPER(CODIGO_EXPEDIENTE)='${normalizedCode}'`
    ];

    for (const whereClause of queries) {
      const params = new URLSearchParams({
        where: whereClause,
        outFields: "*",
        returnGeometry: "true",
        f: "geojson",
      });
      try {
        const response = await fetch(`${layer.url}?${params}`);
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          console.log(`Sequential found in ${Date.now() - start}ms`);
          return;
        }
      } catch (err) {}
    }
  }
  console.log(`Sequential not found in ${Date.now() - start}ms`);
}

async function runConcurrent() {
  const start = Date.now();
  const fetchPromises = [];

  for (const layer of layers) {
    const queries = [
      `UPPER(TENURE_ID)='${normalizedCode}'`,
      `UPPER(CODIGO_EXPEDIENTE)='${normalizedCode}'`
    ];

    for (const whereClause of queries) {
      const params = new URLSearchParams({
        where: whereClause,
        outFields: "*",
        returnGeometry: "true",
        f: "geojson",
      });

      fetchPromises.push(
        fetch(`${layer.url}?${params}`)
          .then(res => res.json())
          .then(data => ({ data, layer }))
          .catch(error => ({ error }))
      );
    }
  }

  const results = await Promise.all(fetchPromises);
  for (const result of results) {
    if (result.error) continue;
    const { data } = result;
    if (data.features && data.features.length > 0) {
      console.log(`Concurrent found in ${Date.now() - start}ms`);
      return;
    }
  }
  console.log(`Concurrent not found in ${Date.now() - start}ms`);
}

async function run() {
  await runSequential();
  await runConcurrent();
}

run();
