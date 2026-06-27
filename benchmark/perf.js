const fs = require('fs');

// Generate large dummy geometry
const rings = [];
for (let i = 0; i < 1000; i++) {
  const ring = [];
  for (let j = 0; j < 100; j++) {
    ring.push([j, j]);
  }
  // close the ring
  ring.push(ring[0]);
  rings.push(ring);
}

// Old way
function oldWay() {
  let allCoordinates = [];
  rings.forEach((ring) => {
    const ringCoords = ring[0] === ring[ring.length - 1] ? ring.slice(0, -1) : ring;
    allCoordinates = [...allCoordinates, ...ringCoords];
  });
  return allCoordinates.length;
}

// New way
function newWay() {
  const allCoordinates = [];
  rings.forEach((ring) => {
    const ringCoords = ring[0] === ring[ring.length - 1] ? ring.slice(0, -1) : ring;
    allCoordinates.push(...ringCoords);
  });
  return allCoordinates.length;
}

console.log("Measuring old way...");
const startOld = performance.now();
oldWay();
const endOld = performance.now();
const timeOld = endOld - startOld;

console.log("Measuring new way...");
const startNew = performance.now();
newWay();
const endNew = performance.now();
const timeNew = endNew - startNew;

console.log(`Old way: ${timeOld.toFixed(2)} ms`);
console.log(`New way: ${timeNew.toFixed(2)} ms`);
console.log(`Speedup: ${(timeOld / timeNew).toFixed(2)}x`);
