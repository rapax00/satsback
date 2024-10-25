# Usa la imagen de Node.js 20
FROM node:20.13.1

# Establece el directorio de trabajo en el contenedor
WORKDIR /app

# Copia los archivos package.json y pnpm-lock.yaml al contenedor
COPY package.json pnpm-lock.yaml ./

# Instala pnpm y las dependencias
RUN npm install -g pnpm && pnpm install

# Copia el resto de los archivos del proyecto
COPY . .

# Genera los tipos de Prisma
RUN pnpm prisma generate

# Compila el proyecto TypeScript
RUN pnpm run build

# Expone el puerto que utilizará la aplicación (ajústalo si es necesario)
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["pnpm", "start"]
