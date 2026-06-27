const { performance } = require('perf_hooks');

function testSpread(rings) {
  let allCoordinates = [];
  const start = performance.now();
  rings.forEach((ring) => {
    const ringCoords = ring[0] === ring[ring.length - 1] ? ring.slice(0, -1) : ring;
    allCoordinates = [...allCoordinates, ...ringCoords];
  });
  const end = performance.now();
  return { time: end - start, length: allCoordinates.length };
}

function testPush(rings) {
  let allCoordinates = [];
  const start = performance.now();
  rings.forEach((ring) => {
    const ringCoords = ring[0] === ring[ring.length - 1] ? ring.slice(0, -1) : ring;
    allCoordinates.push(...ringCoords);
  });
  const end = performance.now();
  return { time: end - start, length: allCoordinates.length };
}

// Generate some dummy data representing a large multipolygon
const generateRings = (numRings, coordsPerRing) => {
  const rings = [];
  for (let i = 0; i < numRings; i++) {
    const ring = [];
    for (let j = 0; j < coordsPerRing; j++) {
      ring.push([Math.random(), Math.random()]);
    }
    ring.push(ring[0]); // close the ring
    rings.push(ring);
  }
  return rings;
};

const rings = generateRings(500, 100);

console.log('Testing spread operator...');
let totalSpreadTime = 0;
for (let i = 0; i < 10; i++) {
  const result = testSpread(rings);
  totalSpreadTime += result.time;
}
console.log(`Average spread time: ${totalSpreadTime / 10} ms`);

console.log('Testing push...');
let totalPushTime = 0;
for (let i = 0; i < 10; i++) {
  const result = testPush(rings);
  totalPushTime += result.time;
}
console.log(`Average push time: ${totalPushTime / 10} ms`);
