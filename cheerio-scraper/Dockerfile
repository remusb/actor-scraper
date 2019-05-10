FROM apify/actor-node-basic

RUN apk update && \
    apk add bash

# Copy source code
COPY . ./

# Install default dependencies, print versions of everything
RUN npm --quiet set progress=false \
 && npm install --only=prod --no-optional \
 && echo "Installed NPM packages:" \
 && npm list || true \
 && echo "Node.js version:" \
 && node --version \
 && echo "NPM version:" \
 && npm --version

 RUN mkdir -p /storage

CMD ./start_actor.sh
