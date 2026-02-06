<h1>Capstone Project</h1>
This Capstone project demonstrates a production-grade Microservices Architecture orchestrated via Docker Compose. The ecosystem consists of independent Node.js services (Users and Orders) that can be accessed using Gateway and utilize specialized data stores (PostgreSQL and MongoDB) to ensure data persistence and integrity.

Orders service communicates with RabbitMQ and the consumer takers care of updating the orders in MongoDB. Users service has all the CRUD operations implemented. Both the services use Redis as cache, where user data is stored.
<h2>Architecture diagram</h2>
<img width="3414" height="1930" alt="Blank diagram" src="https://github.com/user-attachments/assets/0ee21745-aab8-4940-bab1-54edb051e91b" />

<h3>Key Architectural Pillars</h3>
<ul>
  <li>Advanced Traffic Management</li>
  Central to the architecture is an Nginx API Gateway, which serves as the single entry point for all client traffic.
  <li>Network Isolation & Security Hardening</li>
  The infrastructure utilizes a Dual-Network Topology:
  <ul>
    <li>Frontend Network: Isolated for Gateway-to-Service communication.</li>
    <li>Backend Network: A restricted zone for service-to-database and service-to-middleware (RabbitMQ/Redis) traffic.</li>
  </ul>
  <li>Observability</li>
  The project integrates a comprehensive monitoring and logging suite to provide real-time insights into system health:
  <ul>
    <li>Metrics & Visualization: A combination of Prometheus for metrics collection and Grafana for centralized dashboarding.</li>
    <li>Log Aggregation: Utilizing Loki and Promtail to stream logs directly from the Docker engine, enabling distributed log searching without local file storage.</li>
    <li>Tracing: Distributed tracing via Jaeger to track request latency across service boundaries.</li>
  </ul>
  <li>Healthchecks</li>
  Each component includes custom Docker Healthchecks. These scripts ensure that the orchestrator (Docker Compose) is aware of the internal readiness of a service—such as database connectivity or API responsiveness—rather than just the "running" state of the container process.
</ul>

<h2>Runbook for Common Operations</h2>
<ol>
  <h3><li>Initial Deployment</li></h3>
  After clonning the capstone project in your local system, use following command to perform the initial deployment.
  </br>
  
    docker compose -f docker-compose.yml -f observability.yml up -d
    
  <h4>Verification</h4>
  Run <code>docker compose ps</code> to ensure all containers show the <code>(healthy)</code> status.

  <h3><li>Service Scaling</li></h3>
  You can scale the background worker services (like orders) to handle more load without changing the entry point.
  
  <b>Action:</b> Update the number of instances of a specific service.</br>
  <b>Command:</b> 

    docker compose up -d --scale <service_name>=<desired_number_of_instances>
  The Nginx Gateway will automatically round-robin traffic between these instances because they share the same service name in the Docker network.

  <li><h3>Troubleshooting & Logs</h3></li>
  When an API returns an error, follow this sequence to identify the root cause.

  <ul>
    <li><h4>View Aggregated Logs</h4></li>
    
    docker compose logs -f users
  <li><h4>Get information about container</h4></li>

    docker inspect
  <li><h4>View Active Volumes</h4></li>

    docker volume ls
  <li><h4>Stop and remove all the elements</h4></li>

    docker compose -f docker-compose.yml -f observability.yml down 
  <li><h4>Full System Rest - Delete all the volumes data including databases</h4></li>

    docker compose -f docker-compose.yml -f observability.yml down -v
  <li><h4>Observability and Access Table</h4></li>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background-color: #f6f8fa;">
          <th style="padding: 10px; border: 1px solid #d0d7de; text-align: left;">Tool</th>
          <th style="padding: 10px; border: 1px solid #d0d7de; text-align: left;">Access URL</th>
          <th style="padding: 10px; border: 1px solid #d0d7de; text-align: left;">Credentials</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 10px; border: 1px solid #d0d7de;">App Gateway</td>
          <td style="padding: 10px; border: 1px solid #d0d7de;"><a href="http://localhost:8080">http://localhost:8080</a></td>
          <td style="padding: 10px; border: 1px solid #d0d7de;"><em>N/A</em></td>
        </tr>
        <tr style="background-color: #f6f8fa;">
          <td style="padding: 10px; border: 1px solid #d0d7de;">Grafana</td>
          <td style="padding: 10px; border: 1px solid #d0d7de;"><a href="http://localhost:3003">http://localhost:3003</a></td>
          <td style="padding: 10px; border: 1px solid #d0d7de;"><code>admin</code> / <code>admin</code></td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #d0d7de;">Prometheus</td>
          <td style="padding: 10px; border: 1px solid #d0d7de;"><a href="http://localhost:9090">http://localhost:9090</a></td>
          <td style="padding: 10px; border: 1px solid #d0d7de;"><em>N/A</em></td>
        </tr>
        <tr style="background-color: #f6f8fa;">
          <td style="padding: 10px; border: 1px solid #d0d7de;">RabbitMQ UI</td>
          <td style="padding: 10px; border: 1px solid #d0d7de;"><a href="http://localhost:15672">http://localhost:15672</a></td>
          <td style="padding: 10px; border: 1px solid #d0d7de;"><code>guest</code> / <code>guest</code></td>
        </tr>
      </tbody>
    </table>
</ol>

<h2>Security Considerations</h2>
<ol>
  <li><h3>Dual-Network Isolation</h3></li>
  Two distinct networks are defined: <code>frontend</code> and <code>backend</code>.

  The databases (<code>user-db</code>, <code>order-db</code>) and message broker (<code>rmq</code>) are located strictly on the backend network. They have no mapped ports to the host machine. This prevents "lateral movement"; if the Gateway is compromised, the attacker still cannot directly route traffic to the databases from the outside world.
  <li><h3>Read-Only Filesystems</h3></li>
  <ul>
    <li><code>read_only: true</code> is set in the docker-compose.yml for users, orders, and gateway.</li>
    <li>Since Linux processes still require scratch space, we utilize tmpfs mounts for /tmp and /var/cache.</li>
    <li>Any attempt to modify the application binary or inject a script into the container will fail with a Read-only file system error. This ensures the container remains exactly as it was built in the image.</li>
  </ul>

  <li><h3>Principle of Least Privilege (PoLP)</h3></li>
  The application does not run with "Root" privileges, which is a common vulnerability in standard Docker deployments.
  <ul>
    <li>The Dockerfile creates a non-privileged node user, and the docker-compose.yml explicitly sets user: "node".</li>
    <li>In the event of a "container breakout" attempt, the attacker is trapped with limited user permissions, making it significantly harder to interact with the underlying host kernel.</li>
  </ul>

  <li><h3>Secrets Management</h3></li>
  Passwords and connection strings are never hardcoded in the application code or the Dockerfile.
  <ul>
    <li>We use Docker Secrets (or environment files excluded from version control). For example, the database password is mounted at /run/secrets/db_password</li>
    <li>This prevents sensitive credentials from being leaked if the source code is ever exposed or if someone runs docker inspect on a running container.</li>
  </ul>

  <li><h3>API Gateway</h3></li>
  The Nginx Gateway acts as more than just a router; it is the "Security Guard" for the cluster.
</ol>
  
  
</ol>
