export const ColorPicker = ({
  drawingColor,
  handleColorChange,
  showColorPicker,
  setShowColorPicker
}) => {
  return (
    <div className="absolute top-4 right-20 z-10">
      <div className="relative">
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="bg-white p-2 rounded-md shadow-md flex items-center"
          aria-label="Seleccionar color de dibujo"
        >
          <div className="w-5 h-5 rounded-full mr-2" style={{ backgroundColor: drawingColor }}></div>
          <span className="text-xs font-medium">Color</span>
        </button>

        {showColorPicker && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-md shadow-lg p-2 z-20">
            <div className="grid grid-cols-4 gap-2">
              {["#f357a1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#000000", "#ffffff"].map(
                (color) => (
                  <button
                    key={color}
                    onClick={() => {
                      handleColorChange(color)
                      setShowColorPicker(false)
                    }}
                    className={`w-6 h-6 rounded-full border ${
                      drawingColor === color ? "border-gray-800 border-2" : "border-gray-300"
                    }`}
                    style={{
                      backgroundColor: color,
                      boxShadow: color === "#ffffff" ? "inset 0 0 0 1px #e5e7eb" : "none",
                    }}
                    aria-label={`Color ${color}`}
                  />
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
