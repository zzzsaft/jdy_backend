# 使用一个 Node.js 的基础镜像
FROM node:20-alpine

# 在容器中创建一个目录
RUN mkdir -p /usr/src/nodejs/

# 设置工作目录
WORKDIR /usr/src/nodejs/

COPY .env .env.prod .env.dev package.json ./

# 将编译后的代码复制到镜像中
# COPY ./build .
ENV NODE_ENV=production
# 安装项目依赖
# RUN npm install --only=production

# 暴露端口
EXPOSE 2000

# 运行应用
CMD npm start
