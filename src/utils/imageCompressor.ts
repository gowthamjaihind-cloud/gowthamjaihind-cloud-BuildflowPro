export async function compressImage(file: File, maxLongEdge: number = 1600, quality: number = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxLongEdge) {
          height = Math.round(height * (maxLongEdge / width));
          width = maxLongEdge;
        }
      } else {
        if (height > maxLongEdge) {
          width = Math.round(width * (maxLongEdge / height));
          height = maxLongEdge;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not get canvas context"));
      
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas toBlob failed"));
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = (e) => reject(new Error("Image load error"));
  });
}
