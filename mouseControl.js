// Inisialisasi kontrol rotasi objek dengan mouse
export function setupMouseControl(canvas, onRotate) {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
  
    // Fungsi untuk menangani pergerakan mouse
    function onMouseMove(event) {
      if (!isDragging) return;
  
      // Menghitung pergerakan mouse
      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
  
      // Memperbarui posisi terakhir mouse
      lastX = event.clientX;
      lastY = event.clientY;
  
      // Hitung rotasi berdasarkan pergerakan mouse
      onRotate(deltaX, deltaY);
    }
  
    // Fungsi untuk menangani saat mouse ditekan
    function onMouseDown(event) {
      isDragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.style.cursor = 'grab';  // Menampilkan kursor drag
    }
  
    // Fungsi untuk menangani saat mouse dilepaskan
    function onMouseUp(event) {
      isDragging = false;
      canvas.style.cursor = 'default';  // Mengembalikan kursor
    }
  
    // Menambahkan event listener untuk mouse events
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);  // Menangani jika mouse keluar dari area canvas
  
    // Fungsi untuk menghapus kontrol saat tidak diperlukan
    function cleanup() {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
    }
  
    return cleanup;
  }
  