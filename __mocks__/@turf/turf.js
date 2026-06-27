module.exports = {
  area: jest.fn(() => 100),
  length: jest.fn(() => 10),
  center: jest.fn(() => ({ geometry: { coordinates: [0, 0] } })),
  bbox: jest.fn(() => [0, 0, 1, 1]),
  lineString: jest.fn(),
  polygon: jest.fn(),
};
