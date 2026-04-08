---
title: Openstack Helm Etc
description: "Openstack Helm Etc"
---


---  

```shell
apt install python3-pip


mkdir helm
cd helm

curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh

helm repo add openstack-helm https://tarballs.opendev.org/openstack/openstack-helm
helm plugin install https://opendev.org/openstack/openstack-helm-plugin


ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
ssh-copy-id -i ~/.ssh/id_rsa.pub kcloud@129.254.202.64
ssh-copy-id -i ~/.ssh/id_rsa.pub kcloud@129.254.175.93
ssh-copy-id -i ~/.ssh/id_rsa.pub kcloud@129.254.175.94
ssh-copy-id -i ~/.ssh/id_rsa.pub kcloud@129.254.202.241


sudo visudo  
##-- >
##-- 내용 작성
kcloud ALL=(ALL) NOPASSWD:ALL


mkdir ~/osh
cd ~/osh
git clone https://opendev.org/openstack/openstack-helm.git
git clone https://opendev.org/zuul/zuul-jobs.git


pip install ansible

sudo apt update
sudo apt install software-properties-common
sudo add-apt-repository --yes --update ppa:ansible/ansible
sudo apt install ansible


cd ~/osh
vim ansible.cfg  

##-- >
##-- 내용 작성
[defaults]
roles_path = ~/osh/openstack-helm/roles:~/osh/zuul-jobs/roles


cat > ~/osh/inventory.yaml <<EOF
---
all:
  vars:
    ansible_user: kcloud
    ansible_port: 22
    ansible_ssh_private_key_file: /home/kcloud/.ssh/id_rsa
    ansible_ssh_extra_args: -o StrictHostKeyChecking=no
    kubectl:
      user: kcloud
      group: kcloud
    docker_users:
      - kcloud
    client_ssh_user: kcloud
    cluster_ssh_user: kcloud
    metallb_setup: true
    loopback_setup: true
    loopback_device: /dev/loop100
    loopback_image: /var/lib/openstack-helm/ceph-loop.img
    loopback_image_size: 12G
  hosts:
    primary:
      ansible_host: 129.254.202.64
    node-1:
      ansible_host: 129.254.175.93
    node-2:
      ansible_host: 129.254.175.94
    node-3:
      ansible_host:
  children:
    primary:
      hosts:
        primary:
    k8s_cluster:
      hosts:
        node-1:
        node-2:
        node-3:
    k8s_control_plane:
      hosts:
        node-1:
    k8s_nodes:
      hosts:
        node-2:
        node-3:
EOF


cat > ~/osh/deploy-env.yaml <<EOF
---
- hosts: all
  become: true
  gather_facts: true
  roles:
    - ensure-python
    - ensure-pip
    - clear-firewall
    - deploy-env
EOF


vim ~osh/openstack-helm/roles/deploy-env/tasks/client_cluster_tunnel.yaml
# >
# 아래 Register public wireguard key variable 추가
- name: Setup wireguard keys
  when: (groups['primary'] | difference(groups['k8s_control_plane']) | length > 0)
  block:
    - name: Generate wireguard key pair
      shell: |
        wg genkey | tee /root/wg-private-key | wg pubkey > /root/wg-public-key
        chmod 600 /root/wg-private-key
      when: (inventory_hostname in (groups['primary'] | default([]))) or (inventory_hostname in (groups['k8s_control_plane'] | default([])))


    - name: Register public wireguard key variable
      command: cat /root/wg-public-key
      register: wg_public_key
      when: (inventory_hostname in (groups['primary'] | default([]))) or (inventory_hostname in (groups['k8s_control_plane'] | default([])))

vim ~osh/openstack-helm/roles/deploy-env/tasks/client_cluster_ssh.yaml
# > 
# 아래 Save ssh public key to hostvars 추가
# 아래 Set primary ssh public key 수정
    - name: Read ssh public key
      command: cat "{{ client_user_home_directory }}/.ssh/id_ed25519.pub"
      register: ssh_public_key
      when: (inventory_hostname in (groups['primary'] | default([])))

    - name: Save ssh public key to hostvars
      set_fact:
        ssh_public_key: "{{ ssh_public_key }}"
      delegate_to: localhost
      run_once: true
      when: (inventory_hostname in (groups['primary'] | default([])))
      
- name: Setup passwordless ssh from primary and cluster nodes
  become_user: "{{ cluster_ssh_user }}"
  block:
    #- name: Set primary ssh public key
    #  set_fact:
    #    client_ssh_public_key: "{{ (groups['primary'] | map('extract', hostvars, ['ssh_public_key', 'stdout']))[0] }}"
    #  when: inventory_hostname in (groups['k8s_cluster'] | default([]))
    - name: Set primary ssh public key
      set_fact:
        client_ssh_public_key: "{{ hostvars[groups['primary'][0]].ssh_public_key.stdout | default('') }}"
      when: inventory_hostname in (groups['k8s_cluster'] | default([]))


cd ~/osh
ansible-playbook -i inventory.yaml deploy-env.yaml


tee > /tmp/openstack_namespace.yaml <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: openstack
EOF

kubectl apply -f /tmp/openstack_namespace.yaml


helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --version="4.8.3" \
    --namespace=openstack \
    --set controller.kind=Deployment \
    --set controller.admissionWebhooks.enabled="false" \
    --set controller.scope.enabled="true" \
    --set controller.service.enabled="false" \
    --set controller.ingressClassResource.name=nginx \
    --set controller.ingressClassResource.controllerValue="k8s.io/ingress-nginx" \
    --set controller.ingressClassResource.default="false" \
    --set controller.ingressClass=nginx \
    --set controller.labels.app=ingress-api


tee > /tmp/metallb_system_namespace.yaml <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: metallb-system
EOF

kubectl apply -f /tmp/metallb_system_namespace.yaml


helm repo add metallb https://metallb.github.io/metallb
helm install metallb metallb/metallb -n metallb-system

tee > /tmp/metallb_ipaddresspool.yaml <<EOF
---
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
    name: public
    namespace: metallb-system
spec:
    addresses:
    - "172.24.128.0/24"
EOF


kubectl apply -f /tmp/metallb_ipaddresspool.yaml


tee > /tmp/metallb_l2advertisement.yaml <<EOF
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
    name: public
    namespace: metallb-system
spec:
    ipAddressPools:
    - public
EOF

kubectl apply -f /tmp/metallb_l2advertisement.yaml


tee > /tmp/openstack_endpoint_service.yaml <<EOF
---
kind: Service
apiVersion: v1
metadata:
  name: public-openstack
  namespace: openstack
  annotations:
    metallb.universe.tf/loadBalancerIPs: "172.24.128.100"
spec:
  externalTrafficPolicy: Cluster
  type: LoadBalancer
  selector:
    app: ingress-api
  ports:
    - name: http
      port: 80
    - name: https
      port: 443
EOF


kubectl apply -f /tmp/openstack_endpoint_service.yaml

# kubectl taint nodes -l 'node-role.kubernetes.io/control-plane' node-role.kubernetes.io/control-plane-
kubectl label --overwrite nodes --all openstack-control-plane=enabled
#kubectl label --overwrite nodes --all openstack-compute-node=enabled
kubectl label --overwrite nodes kcloud-241 kcloud-242 openstack-compute-node=enabled
kubectl label --overwrite nodes kcloud-93 kcloud-241 kcloud-242 openvswitch=enabled


cd ~osh
vim ./openstack-helm/tools/deployment/ceph/ceph-rook.sh
# >
# Worker Node의 수에 맞게, count 변경
# Worker Node가 3개 이상일 경우, count: 3, allowMultiplePerNode: false
mon:
  count: 1
  allowMultiplePerNode: true
mgr:
  count: 1
  allowMultiplePerNode: true


./openstack-helm/tools/deployment/ceph/ceph-rook.sh


helm upgrade --install ceph-adapter-rook openstack-helm/ceph-adapter-rook \
    --namespace=openstack

helm osh wait-for-pods openstack


export OPENSTACK_RELEASE=2025.1
export FEATURES="${OPENSTACK_RELEASE} ubuntu_noble"
export OVERRIDES_DIR=$(pwd)/overrides
export OVERRIDES_URL=https://opendev.org/openstack/openstack-helm/raw/branch/master/values_overrides


cd ~/osh

cat << EOF > helm_build.sh
#!/bin/bash

# 1. 기준 경로 설정
BASE_DIR=~/osh/openstack-helm

# 2. 대상 Helm 차트 디렉토리 목록 (필요 시 여기에 추가)
packages=(
  rabbitmq
  mariadb
  memcached
  keystone
  heat
  glance
  cinder
  openvswitch
  libvirt
  placement
  nova
  neutron
  horizon
)

# 3. 차트별 의존성 빌드 루프
for pkg in "\${packages[@]}"; do
  CHART_DIR="\$BASE_DIR/\$pkg"
  echo "▶️ Processing \$pkg..."

  # charts/ 디렉토리에 helm-toolkit-* 파일이 있으면 제외
  if ls "\$CHART_DIR/charts/"helm-toolkit-* &> /dev/null; then
    echo "⚠️  Skipping \$pkg — helm-toolkit already present in charts/"
    continue
  fi

  # 디렉토리 존재 여부 확인
  if [ ! -d "\$CHART_DIR" ]; then
    echo "❌ \$CHART_DIR does not exist, skipping."
    continue
  fi

  # 의존성 빌드 실행
  echo "🔧 Running helm dependency build in \$CHART_DIR"
  (cd "\$CHART_DIR" && helm dependency build)

  echo ""
done

echo "✅ Done. All eligible charts have been processed."
EOF

chmod +x helm_build.sh   
./helm_build.sh  


##-- -----------------------------------------------------------------------------
cd ~/osh

helm upgrade --install rabbitmq openstack-helm/rabbitmq \
    --namespace=openstack \
    --set pod.replicas.server=1 \
    --timeout=600s \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c rabbitmq ${FEATURES})

helm osh wait-for-pods openstack


helm upgrade --install mariadb openstack-helm/mariadb \
    --namespace=openstack \
    --set pod.replicas.server=1 \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c mariadb ${FEATURES})

helm osh wait-for-pods openstack


helm upgrade --install memcached openstack-helm/memcached \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c memcached ${FEATURES})

helm osh wait-for-pods openstack


helm upgrade --install keystone openstack-helm/keystone \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c keystone ${FEATURES})

helm osh wait-for-pods openstack


helm upgrade --install heat openstack-helm/heat \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c heat ${FEATURES})

helm osh wait-for-pods openstack


tee ${OVERRIDES_DIR}/glance/glance_pvc_storage.yaml <<EOF
storage: pvc
volume:
  class_name: general
  size: 10Gi
EOF

helm upgrade --install glance openstack-helm/glance \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c glance glance_pvc_storage ${FEATURES})


##-- -----------------------------------------------------------------------------
kubectl -n ceph exec deploy/rook-ceph-tools -- cat /etc/ceph/ceph.conf > ceph.conf

cat ceph.conf
##-- > 위 설정에서 cout를 1로 했을 경우
[global]
mon_host = 129.254.175.94:6789

[client.admin]
keyring = /etc/ceph/keyring

##-- > 위 설정에서 cout를 3로 했을 경우
kcloud@kcloud-64:~/osh$ kubectl -n ceph exec deploy/rook-ceph-tools -- cat /etc/ceph/ceph.conf
[global]
mon_host = 129.254.175.94:6789,129.254.202.241:6789,129.254.202.242:6789

[client.admin]
keyring = /etc/ceph/keyring

##-- confimgmap 재 생성
kubectl -n openstack delete configmap ceph-etc
kubectl -n openstack create configmap ceph-etc --from-file=ceph.conf=ceph.conf

##-- admin keyring 추출
kubectl -n ceph exec deploy/rook-ceph-tools -- \
  ceph auth get client.admin > ceph.client.admin.keyring

cat ceph.client.admin.keyring
##-- >
[client.admin]
        key = AQBaklNooB6MLhAAJ4L/HqiWg37RryeNBmLL4A==
        caps mds = "allow *"
        caps mgr = "allow *"
        caps mon = "allow *"
        caps osd = "allow *"

##-- secret 재 생성
kubectl delete secret pvc-ceph-client-key -n openstack
kubectl create secret generic pvc-ceph-client-key \
  --from-file=key=ceph.client.admin.keyring \
  -n openstack
##-- -----------------------------------------------------------------------------

helm upgrade --install cinder openstack-helm/cinder \
    --namespace=openstack \
    --timeout=600s \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c cinder ${FEATURES})

helm osh wait-for-pods openstack

##-- -----------------------------------------------------------------------------
##-- ceph keyring 복사 작업 추가 (_storage-init.st.tpl)
vim ~/osh/openstack-helm/cinder/templates/bin/_storage-init.st.tpl

##-- 아래 echo "[INFO] 부분 추가
set -ex
if [ "x$STORAGE_BACKEND" == "xcinder.volume.drivers.rbd.RBDDriver" ]; then


  echo "[INFO] Checking if /tmp/client-keyring exists..."
  if [ -f /tmp/client-keyring ]; then
      echo "[INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring"
      cp /tmp/client-keyring /etc/ceph/keyring
      echo "[INFO] Copy complete. Verifying contents:"
      cat /etc/ceph/keyring
  else
      echo "[ERROR] /tmp/client-keyring not found!"
  fi
... 
##-- ----------------------------------------------------------------------------- 


helm upgrade --install openvswitch openstack-helm/openvswitch \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c openvswitch ${FEATURES})

helm osh wait-for-pods openstack


##-- -----------------------------------------------------------------------------
##-- libvirt의 경우 Ceph Keyring 문제가 Cinder와 같이 발생, 아래 부분을 추가함
vim ~/osh/openstack-helm/libvirt/templates/bin/_ceph-keyring.sh.tpl

##-- export HOME=/tmp 밑부터, cp -fv 위까지 내용 추가
...
set -ex
export HOME=/tmp

if [ -f /tmp/client-keyring ]; then
  echo "[INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring"
  cp /tmp/client-keyring /etc/ceph/keyring
  echo "[INFO] Copy complete. Verifying contents:"
  cat /etc/ceph/keyring
else
  echo "[ERROR] /tmp/client-keyring not found!"
  exit 1
fi

cp -fv /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf
...
##-- -----------------------------------------------------------------------------

helm upgrade --install libvirt openstack-helm/libvirt \
    --namespace=openstack \
    --set conf.ceph.enabled=true \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c libvirt ${FEATURES})


helm upgrade --install placement openstack-helm/placement \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c placement ${FEATURES})


tee ${OVERRIDES_DIR}/nova/nova_gpu.yaml <<EOF
conf:
  nova:
    filter_scheduler:
      enabled_filters: >-
        ComputeFilter,ComputeCapabilitiesFilter,ImagePropertiesFilter,
        ServerGroupAntiAffinityFilter,ServerGroupAffinityFilter,
        PciPassthroughFilter
    pci:
      alias:
        - '{ "vendor_id":"10de", "product_id":"20b7", "device_type":"type-PF", "name":"a30" }'
        - '{ "vendor_id":"1ed2", "product_id":"0000", "device_type":"type-PCI", "name":"warboy" }'
      device_spec:
        - '[{ "vendor_id": "10de", "product_id": "20b7" }, { "vendor_id": "1ed2", "product_id": "0000" }]'
EOF

tee ${OVERRIDES_DIR}/nova/nova_gpu.yaml <<EOF
conf:
  nova:
    filter_scheduler:
      enabled_filters: >-
        ComputeFilter,ComputeCapabilitiesFilter,ImagePropertiesFilter,
        ServerGroupAntiAffinityFilter,ServerGroupAffinityFilter,
        PciPassthroughFilter
    pci:
      alias:
        - '{ "vendor_id":"10de", "product_id":"20b7", "device_type":"type-PF", "name":"a30" }'
      device_spec:
        - '{ "vendor_id": "10de", "product_id": "20b7" }'
EOF

# helm upgrade --install nova openstack-helm/nova \
#     --namespace=openstack \
#     --set bootstrap.wait_for_computes.enabled=true \
#     --set conf.ceph.enabled=true \
#     $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c nova ${FEATURES})

helm upgrade --install nova openstack-helm/nova \
    --namespace=openstack \
    --set bootstrap.wait_for_computes.enabled=true \
    --set conf.ceph.enabled=true \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c nova nova_gpu ${FEATURES})

##-- Passthorugh 적용 확인 (xxxxx 는 생성 시 마다 변경됨)
kubectl exec -n openstack nova-compute-default-xxxxx -- cat /etc/nova/nova.conf | grep -A 5 '\[pci\]'
kubectl exec -n openstack nova-compute-default-xxxxx -- cat /etc/nova/nova-cpu.conf | grep -A 5 '\[pci\]'


PROVIDER_INTERFACE=eno1
tee ${OVERRIDES_DIR}/neutron/neutron_simple.yaml << EOF
conf:
  neutron:
    DEFAULT:
      l3_ha: False
      max_l3_agents_per_router: 1
  # <provider_interface_name> will be attached to the br-ex bridge.
  # The IP assigned to the interface will be moved to the bridge.
  auto_bridge_add:
    br-ex: ${PROVIDER_INTERFACE}
  plugins:
    ml2_conf:
      ml2_type_flat:
        flat_networks: public
    openvswitch_agent:
      ovs:
        bridge_mappings: public:br-ex
EOF

helm upgrade --install neutron openstack-helm/neutron \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c neutron neutron_simple ${FEATURES})

helm osh wait-for-pods openstack
```

```shell
##-- 실행 결과 예 (Neutorn 실행 되면, nova-compute 내의 Config 파일을 확인할 수 있음 >
##-- GPU
kcloud@kcloud-64:~/osh/openstack-helm/nova/templates$ kubectl exec -n openstack nova-compute-default-gchhp -- cat /etc/nova/nova.conf | grep -A 5 '\[pci\]'
Defaulted container "nova-compute" out of: nova-compute, init (init), nova-compute-init (init), ceph-perms (init), ceph-admin-keyring-placement (init), ceph-keyring-placement (init), nova-compute-vnc-init (init)
[pci]
alias = { "vendor_id":"10de", "product_id":"20b7", "device_type":"type-PF", "name":"a30" },{ "vendor_id":"1ed2", "product_id":"0000", "device_type":"type-PCI", "name":"warboy" }
device_spec = [{ "vendor_id": "10de", "product_id": "20b7" }, { "vendor_id": "1ed2", "product_id": "0000" }]
[placement]
auth_type = password
auth_url = http://keystone-api.openstack.svc.cluster.local:5000/v3

##-- NPU
kcloud@kcloud-64:~/osh$ kubectl exec -n openstack nova-compute-default-qnkpx -- cat /etc/nova/nova.conf | grep -A 5 '\[pci\]'
Defaulted container "nova-compute" out of: nova-compute, init (init), nova-compute-init (init), ceph-perms (init), ceph-admin-keyring-placement (init), ceph-keyring-placement (init), nova-compute-vnc-init (init)
[pci]
alias = { "vendor_id":"1ed2", "product_id":"0000", "device_type":"type-PCI", "name":"warboy" }
device_spec = { "vendor_id": "1ed2", "product_id": "0000" }
[placement]
auth_type = password
auth_url = http://keystone-api.openstack.svc.cluster.local:5000/v3
```


neutron 설치를 마치면, openvswitch=enabled 라벨링이 되어 있는 노드의 default router가 변경된다.
- 경우에 따라서, 인터넷 연결이 안되는 문제가 발생한다.
- 해결 방법, `br-ex`에 라우팅 정보를 입력

```shell
sudo ip route add default via 129.254.202.1 dev br-ex 
```  


```shell
helm upgrade --install horizon openstack-helm/horizon \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c horizon ${FEATURES})

helm osh wait-for-pods openstack


sudo ip route add default via 129.254.175.1 dev br-ex
sudo ip route add default via 129.254.202.1 dev br-ex
```  


```shell
python3 -m venv ~/openstack-client
source ~/openstack-client/bin/activate
pip install python-openstackclient
```  

```shell
mkdir -p ~/.config/openstack
cat <<EOF | tee ~/.config/openstack/clouds.yaml
clouds:
  openstack_helm:
    region_name: RegionOne
    identity_api_version: 3
    auth:
      username: 'admin'
      password: 'password'
      project_name: 'admin'
      project_domain_name: 'default'
      user_domain_name: 'default'
      auth_url: 'http://keystone.openstack.svc.cluster.local/v3'
EOF

##-- Openstack 설치 확인
openstack --os-cloud openstack_helm endpoint list
openstack compute service list
openstack network agent list
openstack project list
openstack endpoint list
openstack image list
openstack volume service list


# openstack project create demo --description "Demo Project"
# openstack user create --project demo --password 'demo1234' demo
# openstack role add --project demo --user demo member

openstack network create public-net \
  --external \
  --provider-network-type flat \
  --provider-physical-network public \
  --share

openstack subnet create public-subnet \
  --network public-net \
  --subnet-range 192.168.0.0/24 \
  --no-dhcp \
  --gateway 192.168.0.1 \
  --allocation-pool start=192.168.0.100,end=192.168.0.200

openstack network create private-net

openstack subnet create private-subnet \
  --network private-net \
  --subnet-range 192.168.100.0/24 \
  --gateway 192.168.100.1 \
  --dns-nameserver 8.8.8.8

openstack router create router1

openstack router set router1 --external-gateway public-net

openstack router add subnet router1 private-subnet

openstack security group rule create default --proto tcp --dst-port 22
openstack security group rule create default --proto icmp

ssh-keygen -t rsa -b 2048 -N "" -f ~/.ssh/id_rsa
openstack keypair create --public-key ~/.ssh/id_rsa.pub mykey

openstack image create "ubuntu22.04" \
  --file jammy-server-cloudimg-amd64.img \
  --disk-format qcow2 \
  --container-format bare \
  --public

# 생성 VM ID:PASSWORD 접근 설정 (ubuntu:ubuntu)
cat > ubuntu-user-data.yaml <<EOF
#cloud-config
users:
  - name: ubuntu
    groups: sudo
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    lock_passwd: false
ssh_pwauth: true
chpasswd:
  list: |
    ubuntu:ubuntu
  expire: false
EOF

# GPU, NPU Passthrough 용 Flavor
openstack flavor create a30.small --vcpus 2 --ram 2048 --disk 20 --property "pci_passthrough:alias"="a30:1"
openstack flavor create warboy.small --vcpus 2 --ram 2048 --disk 20 --property "pci_passthrough:alias"="warboy:1"

##-- security-group id 확인
openstack security group list

##-- default security-group의 id 활용
openstack server create test-gpu \
  --image ubuntu22.04 \
  --flavor a30.small \
  --network private-net \
  --key-name mykey \
  --user-data ubuntu-user-data.yaml \
  --security-group 74adfb75-75b0-46f1-92c6-e60b345a84be

openstack server create test-npu \
  --image ubuntu22.04 \
  --flavor warboy.small \
  --network private-net \
  --key-name mykey \
  --user-data ubuntu-user-data.yaml \
  --security-group 74adfb75-75b0-46f1-92c6-e60b345a84be

openstack server show test-gpu
openstack floating ip create public-net
openstack server add floating ip test-gpu 192.168.0.188

# 일반용 Flavor
openstack flavor create --ram 2048 --vcpus 2 --disk 20 m1.small.test

openstack server create test-vm \
  --image ubuntu22.04 \
  --flavor m1.small.test \
  --network private-net \
  --key-name mykey \
  --user-data ubuntu-user-data.yaml \
  --security-group  74adfb75-75b0-46f1-92c6-e60b345a84be

openstack server show test-vm
openstack floating ip create public-net

# floating ip create public-net 실행 결과의 floating_ip_address 값을 활용한다.
openstack server add floating ip test-vm 192.168.0.152




(openstack-client) kcloud@kcloud-93:~/openstack-img$ openstack server create test-vm-password \
  --image ubuntu22.04 \
  --flavor m1.small.test \
  --network private-net \
  --key-name mykey \
  --user-data ubuntu-user-data.yaml \
  --security-group default
More than one SecurityGroup exists with the name 'default'.

(openstack-client) kcloud@kcloud-93:~/openstack-img$ openstack security group list
+--------------------------------------+---------+------------------------+----------------------------------+------+
| ID                                   | Name    | Description            | Project                          | Tags |
+--------------------------------------+---------+------------------------+----------------------------------+------+
| 20b765eb-6f0a-451b-a5a6-241288e76f64 | default | Default security group | bef2340a0b2a449a82b4bd8ec92c3cb2 | []   |
| 75f765d2-0704-493d-91e7-224abc1a36f5 | default | Default security group | f6bea898c2394c44bf9e158add4da4d8 | []   |
| 9434bb7e-e22d-4c8a-9edd-4a2cebadf828 | default | Default security group | 8fc10952a12a4d0b9e7739309d1cace0 | []   |
+--------------------------------------+---------+------------------------+----------------------------------+------+


openstack server create test-vm-password \
  --image ubuntu22.04 \
  --flavor m1.small.test \
  --network private-net \
  --key-name mykey \
  --user-data ubuntu-user-data.yaml \
  --security-group 75f765d2-0704-493d-91e7-224abc1a36f5

openstack floating ip create public-net
openstack server add floating ip test-vm-password 192.168.0.152

openstack console url show test-vm-password

http://novncproxy.openstack.svc.cluster.local/vnc_auto.html?path=%3Ftoken%3D4744cf0c-3b98-4ba4-a26a-8bc11fb37465


sudo apt-get install nginx -y

sudo vim /etc/nginx/site-available/default
# > 
        location / {
                # First attempt to serve request as file, then
                # as directory, then fall back to displaying a 404.
                proxy_pass http://10.96.246.41;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
        }
nginx -t
sudo systemctl reload nginx



openstack server show test-gpu

openstack server remove floating ip test-gpu 192.168.0.165
openstack floating ip delete 192.168.0.165
openstack server delete test-gpu

```  




# Troubleshooting

---

## CoreDNS, Calico
- kuberentes 설치 시, 기본 네트워크는 `--pod-network-cidr=10.244.0.0/16`
- `ansible-playbook -i inventory.yaml deploy-env.yaml` 수행 후, calico가 생성, 실행되지 않으면 아래 과정을 수행해야한다.
  - 해당 과정은 ~/osh/openstack-helm/role/deploy-env/tasks/calico.yaml 에 명시되어 있음

  ```shell
  cd /tmp
  curl -O https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml4
  cp ~/osh/openstack-helm/role/deploy-env/files/calico_patch.yaml /tmp/

  kubectl apply -f /tmp/calico.yaml
  kubectl kubectl -n kube-system patch daemonset calico-node --patch-file /tmp/calico_patch.yaml
  ```

  ```yaml
  # calico_patch.yaml 내용
  # Prometheus 모니터링 기능을 활성화하고, 불필요한 인터페이스를 IP자동 탐지에서 제외하도록 설정
  ---
  spec:
  template:
      metadata:
      annotations:
          prometheus.io/scrape: "true"
          prometheus.io/port: "9091"
      spec:
      containers:
          - name: calico-node
          env:
              - name: FELIX_PROMETHEUSMETRICSENABLED
              value: "true"
              - name: FELIX_PROMETHEUSMETRICSPORT
              value: "9091"
              - name: FELIX_IGNORELOOSERPF
              value: "true"
              # we need Calico to skip this interface while discovering the
              # network changes on the host to prevent announcing unnecessary networks.
              - name: IP_AUTODETECTION_METHOD
              value: "skip-interface=br-ex|provider.*|client.*"
  ...
  ```  

  | 항목                                      | 설명                                                                 |
  |------------------------------------------|----------------------------------------------------------------------|
  | `FELIX_PROMETHEUSMETRICSENABLED: true`   | Calico의 Prometheus 메트릭 수집을 활성화                            |
  | `FELIX_PROMETHEUSMETRICSPORT: 9091`      | Prometheus 메트릭을 9091 포트에서 노출                              |
  | `FELIX_IGNORELOOSERPF: true`             | 리눅스 Reverse Path Filtering 무시 (특정 네트워크 환경에서 필요)     |
  | `IP_AUTODETECTION_METHOD: skip-interface=...` | Calico가 특정 네트워크 인터페이스를 자동 감지에서 제외하도록 설정 |
  | `prometheus.io/scrape: "true"`           | Prometheus가 이 Pod를 스크레이핑 대상이라고 인식하도록 함           |
  | `prometheus.io/port: "9091"`             | Prometheus가 메트릭을 수집할 포트 지정             


## DNS 수정 필요 있음  

resovle.conf에 nameserver를 10.96.0.10 으로 지정할 경우, 해당 노드는 인터넷 망이 차단된다.  

```shell
kcloud@kcloud-93:~$ sudo cat /etc/resolv.conf
nameserver 10.96.0.10
nameserver 8.8.8.8


kcloud@kcloud-64:~/osh/openstack-helm/roles/deploy-env$ grep -rnI "10.96.0.10" .
./files/cluster_resolv.conf:1:nameserver 10.96.0.10
kcloud@kcloud-64:~/osh/openstack-helm/roles/deploy-env$ cat files/cluster_resolv.conf
nameserver 10.96.0.10
kcloud@kcloud-64:~/osh/openstack-helm/roles/deploy-env$ grep -rnI "cluster_resolv" .
./tasks/coredns_resolver.yaml:56:    src: files/cluster_resolv.conf
kcloud@kcloud-64:~/osh/openstack-helm/roles/deploy-env$ cat tasks/coredns_resolver.yaml
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

---
- name: Enable recursive queries for coredns
  become: false
  shell: |
    tee > /tmp/coredns_configmap.yaml <<EOF
    apiVersion: v1
    kind: ConfigMap
    metadata:
      name: coredns
      namespace: kube-system
    data:
      Corefile: |
        .:53 {
            errors
            health {
              lameduck 5s
            }
            header {
                response set ra
            }
            ready
            kubernetes cluster.local in-addr.arpa ip6.arpa {
              pods insecure
              fallthrough in-addr.arpa ip6.arpa
              ttl 30
            }
            prometheus :9153
            forward . 8.8.8.8 {
              max_concurrent 1000
            }
            cache 30
            loop
            reload
            loadbalance
        }
    EOF
    kubectl apply -f /tmp/coredns_configmap.yaml
    kubectl rollout restart -n kube-system deployment/coredns
    kubectl rollout status -n kube-system deployment/coredns
  when: inventory_hostname in (groups['primary'] | default([]))

- name: Use coredns as default DNS resolver
  copy:
    src: files/cluster_resolv.conf
    dest: /etc/resolv.conf
    owner: root
    group: root
    mode: 0644
  when: inventory_hostname in (groups['k8s_cluster'] | default([]))
...

```

## Pod 네트워크 테스트 방법
curl 실행 가능한 임시 포드생성  
```shell
kubectl run curlpod --rm -it --image=curlimages/curl:latest --restart=Never -- sh

kcloud@kcloud-64:~$ kubectl run curlpod --rm -it --image=curlimages/curl:latest --restart=Never -- sh
If you don't see a command prompt, try pressing enter.
~ $ nslookup metallb-webhook-service.metallb-system.svc
Server:         10.96.0.10
Address:        10.96.0.10:53
```

## Ansible 출력 

|키워드|의미|중단여부|
|-|-|-|
|ok|성공했지만 상태 변화 없음|계속|
|changed|성공했고 상태 변경 발생|계속|
|skipping|조건 미충족으로 건너뜀|계속|
|fatal|실패 (명령 오류, 설정 오류 등)|중단|
|...ignoring|실패했지만 ignore_errors: yes 덕분에 무시하고 계속 진행|계속|

## 롤백

```shell
cd ~/osh
cat > ~/osh/reset-k8s.yaml <<EOF
---
- name: Reset Kubernetes Cluster and OpenStack-Helm Environment
  hosts: all
  become: true
  vars:
    openstack_namespaces:
      - openstack
      - ceph
      - ingress
      - osh-infra
    loopback_setup: true
    loopback_device: /dev/loop100
    kubectl_path: /usr/bin/kubectl
    helm_path: /usr/local/bin/helm

  tasks:
    # Step 1: Remove Helm releases
    - name: Uninstall all Helm releases in OpenStack namespaces
      shell: |
        {{ helm_path }} ls -n {{ item }} -q | xargs -r -n1 -I{} {{ helm_path }} uninstall {} -n {{ item }}
      loop: "{{ openstack_namespaces }}"
      ignore_errors: true

    # Step 2: Delete PVC, PV, namespaces
    - name: Delete all PVCs and PVs
      shell: |
        {{ kubectl_path }} delete pvc --all --all-namespaces || true
        {{ kubectl_path }} delete pv --all || true
      ignore_errors: true

    - name: Delete OpenStack-related namespaces
      shell: |
        {{ kubectl_path }} delete ns {{ item }} --ignore-not-found
      loop: "{{ openstack_namespaces }}"
      ignore_errors: true

    # Step 3: Cleanup Docker containers and volumes
    - name: Remove all Docker containers and images
      shell: |
        docker rm -f $(docker ps -aq) || true
        docker rmi -f $(docker images -aq) || true
        docker volume prune -f || true
        docker network prune -f || true
      ignore_errors: true

    # Step 4: Remove CNI and virtual interfaces
    - name: Delete CNI-related interfaces
      shell: |
        ip link delete cni0 || true
        ip link delete flannel.1 || true
        ip link delete docker0 || true
        ip link delete cali0 || true
        ip link delete kube-ipvs0 || true
        ip link delete vxlan.calico || true
        ip link delete metallb || true
      ignore_errors: true

    # Step 5: Reset kubeadm
    - name: Reset Kubernetes cluster
      shell: kubeadm reset -f || true
      ignore_errors: true

    # Step 6: Remove Kubernetes and containerd packages
    - name: Remove K8s and containerd packages
      apt:
        name:
          - kubelet
          - kubeadm
          - kubectl
          - containerd
        state: absent
        purge: yes
      ignore_errors: true

    # Step 7: Delete remaining directories
    - name: Delete Kubernetes and related directories
      file:
        path: "{{ item }}"
        state: absent
      loop:
        - /etc/kubernetes
        - /etc/cni
        - /opt/cni
        - /var/lib/kubelet
        - /var/lib/containerd
        - /var/lib/calico
        - /etc/systemd/system/containerd.service
        - /etc/metallb
        - /etc/ceph
        - /var/lib/ceph
        - /var/lib/rook
        - ~/.kube
        - ~/.helm
        - ~/.config/helm

    # Step 8: Reset iptables and IPVS
    - name: Flush iptables and IPVS settings
      shell: |
        iptables -F && iptables -X && iptables -t nat -F && iptables -t nat -X
        ipvsadm --clear || true
      ignore_errors: true

    # Step 9: Remove loopback device if configured
    - name: Remove loopback device
      shell: rm -f {{ loopback_device }}
      when: loopback_setup | default(false)
      ignore_errors: true

    # Step 10: Reload systemd
    - name: Reload systemd daemons
      shell: systemctl daemon-reexec && systemctl daemon-reload

    # Step 11: Restore resolv.conf
    - name: Restore resolv.conf to public DNS
      copy:
        content: |
          nameserver 8.8.8.8
          nameserver 1.1.1.1
        dest: /etc/resolv.conf
        owner: root
        group: root
        mode: 0644
EOF


ansible-playbook -i inventory.yaml ~/reset-cluster.yaml
```

## Ceph, Rook-ceph 설치 롤백

아래처럼 rook-ceph-tools 가 ContainerCreating으로 멈춰있으면  
- cephcluster 리소스가 아직 Deleting 상태이거나 Error 상태
- 종속 리소스 CephBlockPool, CephFilesystem 등으로 인해 완전히 삭제되지 못한 상태
- 따라서, Rook operator가 새로운 cephcluster를 생성하지 못하고, configmap, secret이 생성되지 않음
  - configmap, secret이 생성되지 않으면 rook-ceph-tools가 생성되지 않음

```shell
kcloud@kcloud-64:/tmp$ kubectl get pod -A
NAMESPACE        NAME                                        READY   STATUS              RESTARTS       AGE
ceph             rook-ceph-tools-564d69988b-726lp            0/1     ContainerCreating   0              8m45s

# ---- 

kubectl get cephcluster -n ceph

kcloud@kcloud-64:/tmp$ kubectl get cephcluster -n ceph
NAME   DATADIRHOSTPATH   MONCOUNT   AGE     PHASE      MESSAGE                    HEALTH   EXTERNAL   FSID
ceph   /var/lib/rook     3          9m43s   Deleting   Deleting the CephCluster


kubectl describe cephcluster ceph -n ceph

kcloud@kcloud-64:/tmp$ kubectl describe cephcluster ceph -n ceph
Name:         ceph
... 
Events:
  Type     Reason           Age               From                          Message
  ----     ------           ----              ----                          -------
  Warning  ReconcileFailed  4s (x7 over 64s)  rook-ceph-cluster-controller  failed to reconcile CephCluster "ceph/ceph". CephCluster "ceph/ceph" will not be deleted until all dependents are removed: CephBlockPool: [rbd], CephFilesystem: [cephfs], CephFilesystemSubVolumeGroup: [cephfs-csi], CephObjectStore: [default]

kubectl describe pod rook-ceph-tools-564d69988b-8trlw -n ceph


kcloud@kcloud-64:/tmp$ kubectl describe pod rook-ceph-tools-564d69988b-8trlw -n ceph
...
Events:
  Type     Reason       Age                  From               Message
  ----     ------       ----                 ----               -------
  Normal   Scheduled    15m                  default-scheduler  Successfully assigned ceph/rook-ceph-tools-564d69988b-726lp to kcloud-94
  Warning  FailedMount  5m5s (x13 over 15m)  kubelet            MountVolume.SetUp failed for volume "ceph-admin-secret" : secret "rook-ceph-mon" not found
  Warning  FailedMount  3m3s (x14 over 15m)  kubelet            MountVolume.SetUp failed for volume "mon-endpoint-volume" : configmap "rook-ceph-mon-endpoints" not found


kubectl get crd | grep rook

kcloud@kcloud-64:~/osh/openstack-helm/tools/deployment/ceph$ kubectl get crd | grep rook
cephblockpoolradosnamespaces.ceph.rook.io               2025-06-13T08:29:13Z
cephblockpools.ceph.rook.io                             2025-06-13T08:29:13Z
cephbucketnotifications.ceph.rook.io                    2025-06-13T08:29:13Z
cephbuckettopics.ceph.rook.io                           2025-06-13T08:29:13Z
cephclients.ceph.rook.io                                2025-06-13T08:29:13Z
cephclusters.ceph.rook.io                               2025-06-13T08:29:13Z
cephcosidrivers.ceph.rook.io                            2025-06-13T08:29:13Z
cephfilesystemmirrors.ceph.rook.io                      2025-06-13T08:29:13Z
cephfilesystems.ceph.rook.io                            2025-06-13T08:29:13Z
cephfilesystemsubvolumegroups.ceph.rook.io              2025-06-13T08:29:13Z
cephnfses.ceph.rook.io                                  2025-06-13T08:29:13Z
cephobjectrealms.ceph.rook.io                           2025-06-13T08:29:13Z
cephobjectstores.ceph.rook.io                           2025-06-13T08:29:13Z
cephobjectstoreusers.ceph.rook.io                       2025-06-13T08:29:13Z
cephobjectzonegroups.ceph.rook.io                       2025-06-13T08:29:13Z
cephobjectzones.ceph.rook.io                            2025-06-13T08:29:13Z
cephrbdmirrors.ceph.rook.io                             2025-06-13T08:29:13Z


# ---
```  

아래와 같이 강제 삭제  

```shell
kubectl get crd | grep rook | awk '{print $1}' | xargs kubectl delete crd --grace-period=0 --force

kubectl patch cephblockpool rbd -n ceph -p '{"metadata":{"finalizers":[]}}' --type=merge
kubectl patch cephfilesystem cephfs -n ceph -p '{"metadata":{"finalizers":[]}}' --type=merge
kubectl patch cephfilesystemsubvolumegroup cephfs-csi -n ceph -p '{"metadata":{"finalizers":[]}}' --type=merge
kubectl patch cephobjectstore default -n ceph -p '{"metadata":{"finalizers":[]}}' --type=merge
```  

```shell
helm uninstall rook-ceph-cluster -n ceph
kubectl delete namespace ceph --wait=true

helm uninstall rook-ceph -n rook-ceph
kubectl delete namespace rook-ceph --wait=true

# kubectl delete 에서 멈춰 있는 경우
# 원인: finalizer

kubectl get namespace ceph -o json | jq '.spec.finalizers'

# 위 명령어의 출력이 아래와 같으면 강제 삭제 수행  

[
  "kubernetes"
]


kubectl get namespace ceph -o json > ceph-ns.json
vim ceph-ns.json 

> # spec을 두 번째 단락과 같이 변경
"spec": {
  "finalizers": ["kubernetes"]
}

"spec": {
  "finalizers": []
}

# 수정된 파일로 강제 업데이트  
kubectl replace --raw "/api/v1/namespaces/ceph/finalize" -f ./ceph-ns.json  
```  

위와 같은 방법으로도, crd 등이 남아있고, 강제 삭제가 안되는 상황

```shell
# kubernetes master node 진입
sudo apt install etcd-client

kcloud@kcloud-93:~$ grep etcd /etc/kubernetes/manifests/etcd.yaml
grep: /etc/kubernetes/manifests/etcd.yaml: Permission denied
kcloud@kcloud-93:~$ sudo grep etcd /etc/kubernetes/manifests/etcd.yaml
    kubeadm.kubernetes.io/etcd.advertise-client-urls: https://129.254.175.93:2379
    component: etcd
  name: etcd
    - etcd
    - --cert-file=/etc/kubernetes/pki/etcd/server.crt
    - --data-dir=/var/lib/etcd
    - --key-file=/etc/kubernetes/pki/etcd/server.key
    - --peer-cert-file=/etc/kubernetes/pki/etcd/peer.crt
    - --peer-key-file=/etc/kubernetes/pki/etcd/peer.key
    - --peer-trusted-ca-file=/etc/kubernetes/pki/etcd/ca.crt
    - --trusted-ca-file=/etc/kubernetes/pki/etcd/ca.crt
    image: registry.k8s.io/etcd:3.5.16-0
    name: etcd
    - mountPath: /var/lib/etcd
      name: etcd-data
    - mountPath: /etc/kubernetes/pki/etcd
      name: etcd-certs
      path: /etc/kubernetes/pki/etcd
    name: etcd-certs
      path: /var/lib/etcd
    name: etcd-data

export ETCDCTL_API=3
export ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt
export ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt
export ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key
export ETCDCTL_ENDPOINTS=https://127.0.0.1:2379

sudo -E etcdctl get "" --prefix --keys-only | grep rook

kcloud@kcloud-93:~$ sudo -E etcdctl get "" --prefix --keys-only | grep rook
/registry/apiextensions.k8s.io/customresourcedefinitions/cephblockpools.ceph.rook.io
/registry/apiextensions.k8s.io/customresourcedefinitions/cephclusters.ceph.rook.io
/registry/apiextensions.k8s.io/customresourcedefinitions/cephfilesystems.ceph.rook.io
/registry/apiextensions.k8s.io/customresourcedefinitions/cephfilesystemsubvolumegroups.ceph.rook.io
/registry/apiextensions.k8s.io/customresourcedefinitions/cephobjectstores.ceph.rook.io
/registry/apiregistration.k8s.io/apiservices/v1.ceph.rook.io
/registry/ceph.rook.io/cephblockpools/ceph/rbd
/registry/ceph.rook.io/cephclusters/ceph/ceph
/registry/ceph.rook.io/cephfilesystems/ceph/cephfs
/registry/ceph.rook.io/cephfilesystemsubvolumegroups/ceph/cephfs-csi
/registry/ceph.rook.io/cephobjectstores/ceph/default
/registry/csidrivers/rook-ceph.rbd.csi.ceph.com

sudo -E etcdctl del /registry/apiextensions.k8s.io/customresourcedefinitions/cephblockpools.ceph.rook.io

kcloud@kcloud-93:~$ sudo -E etcdctl del /registry/apiextensions.k8s.io/customresourcedefinitions/cephblockpools.ceph.rook.io
sudo -E etcdctl del /registry/apiextensions.k8s.io/customresourcedefinitions/cephclusters.ceph.rook.io
sudo -E etcdctl del /registry/apiextensions.k8s.io/customresourcedefinitions/cephfilesystems.ceph.rook.io
sudo -E etcdctl del /registry/apiextensions.k8s.io/customresourcedefinitions/cephfilesystemsubvolumegroups.ceph.rook.io
sudo -E etcdctl del /registry/apiextensions.k8s.io/customresourcedefinitions/cephobjectstores.ceph.rook.io

sudo -E etcdctl del /registry/apiregistration.k8s.io/apiservices/v1.ceph.rook.io

sudo -E etcdctl del /registry/ceph.rook.io/cephblockpools/ceph/rbd
sudo -E etcdctl del /registry/ceph.rook.io/cephclusters/ceph/ceph
sudo -E etcdctl del /registry/ceph.rook.io/cephfilesystems/ceph/cephfs
sudo -E etcdctl del /registry/ceph.rook.io/cephfilesystemsubvolumegroups/ceph/cephfs-csi
sudo -E etcdctl del /registry/ceph.rook.io/cephobjectstores/ceph/default

sudo -E etcdctl del /registry/csidrivers/rook-ceph.rbd.csi.ceph.com
1
1
1
1
1
0
1
1
1
1
1
1

kcloud@kcloud-93:~$ sudo -E etcdctl get "" --prefix --keys-only | grep rook
kcloud@kcloud-93:~$

```  


## CoreDNS fowrard 수정

OpenStack Glance 설치 시, 내부 Pod에서 DNSquery로 Repository 및 Image의 URL에 접근하는 과정이 있음  
현재 설정된 CoreDNS는 외부로의 DNS Query가 허용되지 않아 설치 실패 문제가 발생함  

```shell
# 설치 실패
# curl http://download.cirros-cloud.net/0.6.2/cirros-0.6.2-x86_64-disk.img 가 실패함
kcloud@kcloud-64:~/osh$ kubectl describe pod -n openstack glance-bootstrap-88s7h
...


kcloud@kcloud-64:~/osh$ kubectl logs -n openstack glance-bootstrap-88s7h
Defaulted container "bootstrap" out of: bootstrap, init (init)
+ export HOME=/tmp
+ HOME=/tmp
+ cd /tmp/images
+ openstack image show 'Cirros 0.6.2 64-bit'
No Image found for Cirros 0.6.2 64-bit
+ curl --fail -sSL -O http://download.cirros-cloud.net/0.6.2/cirros-0.6.2-x86_64-disk.img
curl: (6) Could not resolve host: download.cirros-cloud.net

# CoreDNS 확인 및 수정
kubectl -n kube-system edit configmap coredns
configmap/coredns edited

> # forward 부분을 8.8.8.8 1.1.1.1 로 변경

# Please edit the object below. Lines beginning with a '#' will be ignored,
# and an empty file will abort the edit. If an error occurs while saving this file will be
# reopened with the relevant failures.
#
apiVersion: v1
data:
  Corefile: |
    .:53 {
        errors
        health {
           lameduck 5s
        }
        ready
        kubernetes cluster.local in-addr.arpa ip6.arpa {
           pods insecure
           fallthrough in-addr.arpa ip6.arpa
           ttl 30
        }
        prometheus :9153
        forward .  8.8.8.8 1.1.1.1 {       ## 기존 /etc/resolv.conf
           max_concurrent 1000
        }
        cache 30 {
           disable success cluster.local
           disable denial cluster.local
        }
        loop
        reload
        loadbalance
    }
kind: ConfigMap
metadata:
  creationTimestamp: "2025-06-13T01:21:40Z"
  name: coredns
  namespace: kube-system
  resourceVersion: "489707"
  uid: 5812f38b-bf92-4d56-b387-df32f5a8688c

> # coreDNS 재시작
kubectl rollout restart deployment coredns -n kube-system
```

## Cinder 설치 에러

Ceph Config, Secret Key 문제로 판단

```shell
kcloud@kcloud-64:~/osh$ kubectl describe pod -n openstack cinder-backup-5c65f87fd6-wslkr | tail -10
QoS Class:                   BestEffort
Node-Selectors:              openstack-control-plane=enabled
Tolerations:                 node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
                             node.kubernetes.io/unreachable:NoExecute op=Exists for 300s
Events:
  Type     Reason       Age                   From               Message
  ----     ------       ----                  ----               -------
  Normal   Scheduled    20m                   default-scheduler  Successfully assigned openstack/cinder-backup-5c65f87fd6-wslkr to kcloud-94
  Warning  FailedMount  9m44s (x13 over 20m)  kubelet            MountVolume.SetUp failed for volume "ceph-keyring" : secret "cinder-volume-rbd-keyring" not found
  Warning  FailedMount  3m38s (x16 over 20m)  kubelet            MountVolume.SetUp failed for volume "ceph-etc" : configmap "ceph-etc" not found
kcloud@kcloud-64:~/osh$ kubectl describe pod -n openstack cinder-volume-bc4d8f855-tl26q | tail -10
QoS Class:                   BestEffort
Node-Selectors:              openstack-control-plane=enabled
Tolerations:                 node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
                             node.kubernetes.io/unreachable:NoExecute op=Exists for 300s
Events:
  Type     Reason       Age                   From               Message
  ----     ------       ----                  ----               -------
  Normal   Scheduled    20m                   default-scheduler  Successfully assigned openstack/cinder-volume-bc4d8f855-tl26q to kcloud-93
  Warning  FailedMount  9m53s (x13 over 20m)  kubelet            MountVolume.SetUp failed for volume "ceph-keyring" : secret "cinder-volume-rbd-keyring" not found
  Warning  FailedMount  3m47s (x16 over 20m)  kubelet            MountVolume.SetUp failed for volume "ceph-etc" : configmap "ceph-etc" not found
kcloud@kcloud-64:~/osh$ kubectl describe pod -n openstack cinder-storage-init-kzwcv | tail -10
QoS Class:                   BestEffort
Node-Selectors:              openstack-control-plane=enabled
Tolerations:                 node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
                             node.kubernetes.io/unreachable:NoExecute op=Exists for 300s
Events:
  Type     Reason       Age                   From               Message
  ----     ------       ----                  ----               -------
  Normal   Scheduled    17m                   default-scheduler  Successfully assigned openstack/cinder-storage-init-kzwcv to kcloud-93
  Warning  FailedMount  7m15s (x13 over 17m)  kubelet            MountVolume.SetUp failed for volume "ceph-keyring" : secret "pvc-ceph-client-key" not found
  Warning  FailedMount  69s (x16 over 17m)    kubelet            MountVolume.SetUp failed for volume "ceph-etc" : configmap "ceph-etc" not found
kcloud@kcloud-64:~/osh$ kubectl describe pod -n openstack cinder-api-64845fd466-bsrbs | tail -10
Node-Selectors:              openstack-control-plane=enabled
Tolerations:                 node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
                             node.kubernetes.io/unreachable:NoExecute op=Exists for 300s
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  20m   default-scheduler  Successfully assigned openstack/cinder-api-64845fd466-bsrbs to kcloud-93
  Normal  Pulled     20m   kubelet            Container image "quay.io/airshipit/kubernetes-entrypoint:latest-ubuntu_focal" already present on machine
  Normal  Created    20m   kubelet            Created container: init
  Normal  Started    20m   kubelet            Started container init
kcloud@kcloud-64:~/osh$ kubectl describe pod -n openstack cinder-scheduler-7c7fdb4648-cjmx9 | tail -10
Node-Selectors:              openstack-control-plane=enabled
Tolerations:                 node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
                             node.kubernetes.io/unreachable:NoExecute op=Exists for 300s
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  21m   default-scheduler  Successfully assigned openstack/cinder-scheduler-7c7fdb4648-cjmx9 to kcloud-94
  Normal  Pulled     21m   kubelet            Container image "quay.io/airshipit/kubernetes-entrypoint:latest-ubuntu_focal" already present on machine
  Normal  Created    21m   kubelet            Created container: init
  Normal  Started    21m   kubelet            Started container init
kcloud@kcloud-64:~/osh$
kcloud@kcloud-64:~/osh$ kubectl get jobs -n openstack | grep cinder
cinder-backup-storage-init      Complete   1/1           4s         19m
cinder-create-internal-tenant   Complete   1/1           12s        19m
cinder-db-init                  Complete   1/1           7s         21m
cinder-db-sync                  Complete   1/1           83s        21m
cinder-ks-endpoints             Complete   1/1           16s        19m
cinder-ks-service               Complete   1/1           19s        20m
cinder-ks-user                  Complete   1/1           23s        19m
cinder-rabbit-init              Complete   1/1           7s         20m
cinder-storage-init             Running    0/1           18m        18m

```  

```shell
# cepf.conf 활용 Confgmap 생성 및 client.cinder 인증 키 발급 및 Secret 생성
kcloud@kcloud-64:~/osh$ kubectl -n ceph exec -it deploy/rook-ceph-tools -- cat /etc/ceph/ceph.conf > ceph.conf
kcloud@kcloud-64:~/osh$ cat ceph.conf
[global]
mon_host = 129.254.175.94:6789

[client.admin]
keyring = /etc/ceph/keyring
kcloud@kcloud-64:~/osh$ kubectl -n openstack create configmap ceph-etc --from-file=ceph.conf=ceph.conf
configmap/ceph-etc created
kcloud@kcloud-64:~/osh$ kubectl get configmap -A
NAMESPACE         NAME                                                   DATA   AGE
ceph              kube-root-ca.crt                                       1      2d23h
ceph              rook-ceph-mon-endpoints                                5      2d23h
ceph              rook-ceph-pdbstatemap                                  2      2d23h
ceph              rook-ceph-rgw-default-mime-types                       1      2d23h
ceph              rook-config-override                                   1      2d23h
default           kube-root-ca.crt                                       1      3d7h
kube-node-lease   kube-root-ca.crt                                       1      3d7h
kube-public       cluster-info                                           1      3d7h
kube-public       kube-root-ca.crt                                       1      3d7h
kube-system       calico-config                                          4      3d7h
kube-system       coredns                                                1      3d7h
kube-system       extension-apiserver-authentication                     6      3d7h
kube-system       kube-apiserver-legacy-service-account-token-tracking   1      3d7h
kube-system       kube-proxy                                             2      3d7h
kube-system       kube-root-ca.crt                                       1      3d7h
kube-system       kubeadm-config                                         1      3d7h
kube-system       kubelet-config                                         1      3d7h
metallb-system    kube-root-ca.crt                                       1      3d3h
metallb-system    metallb-excludel2                                      1      3d2h
metallb-system    metallb-frr-startup                                    3      3d2h
openstack         ceph-etc                                               1      6s
openstack         cinder-bin                                             22     47m
openstack         glance-bin                                             16     67m
openstack         heat-bin                                               17     178m
openstack         ingress-nginx-controller                               1      3d3h
openstack         keystone-bin                                           14     3h23m
openstack         kube-root-ca.crt                                       1      3d3h
openstack         mariadb-bin                                            5      4h1m
openstack         mariadb-etc                                            3      4h1m
openstack         mariadb-mariadb-state                                  5      4h1m
openstack         mariadb-services-tcp                                   1      4h1m
openstack         memcached-memcached-bin                                2      3h58m
openstack         rabbitmq-rabbitmq-bin                                  7      4h23m
openstack         rabbitmq-rabbitmq-etc                                  4      4h23m
rook-ceph         kube-root-ca.crt                                       1      2d23h
rook-ceph         rook-ceph-csi-config                                   1      2d23h
rook-ceph         rook-ceph-csi-mapping-config                           1      2d23h
rook-ceph         rook-ceph-operator-config                              46     2d23h
kcloud@kcloud-64:~/osh$ kubectl -n openstack get configmap ceph-etc
NAME       DATA   AGE
ceph-etc   1      20s
kcloud@kcloud-64:~/osh$ kubectl -n ceph exec -it deploy/rook-ceph-tools -- bash
bash-5.1$ ceph auth get-or-create client.cinder mon 'allow r' osd 'allow rwx pool=cinder'
[client.cinder]
        key = AQB04U9oTiF/LxAA+A2XWqmiQjNfyIUcNCPXgg==
bash-5.1$ exit
exit
kcloud@kcloud-64:~/osh$ kubectl -n openstack create secret generic cinder-volume-rbd-keyring \
  --from-literal=keyring="[client.cinder]
  key = AQB04U9oTiF/LxAA+A2XWqmiQjNfyIUcNCPXgg==
  caps mon = \"allow r\"
  caps osd = \"allow rwx pool=cinder\""
secret/cinder-volume-rbd-keyring created
kcloud@kcloud-64:~/osh$
kcloud@kcloud-64:~/osh$ kubectl get secret -n openstack
NAME                                  TYPE                 DATA   AGE
cinder-db-admin                       Opaque               1      50m
cinder-db-user                        Opaque               1      50m
cinder-etc                            Opaque               12     50m
cinder-keystone-admin                 Opaque               9      50m
cinder-keystone-test                  Opaque               9      50m
cinder-keystone-user                  Opaque               9      50m
cinder-rabbitmq-admin                 Opaque               1      50m
cinder-rabbitmq-user                  Opaque               1      50m
cinder-volume-rbd-keyring             Opaque               1      24s
glance-db-admin                       Opaque               1      69m
glance-db-user                        Opaque               1      69m
glance-etc                            Opaque               12     69m
glance-keystone-admin                 Opaque               9      69m
glance-keystone-test                  Opaque               9      69m
glance-keystone-user                  Opaque               9      69m
glance-rabbitmq-admin                 Opaque               1      69m
glance-rabbitmq-user                  Opaque               1      69m
heat-db-admin                         Opaque               1      3h1m
heat-db-user                          Opaque               1      3h1m
heat-etc                              Opaque               13     3h1m
heat-keystone-admin                   Opaque               9      3h1m
heat-keystone-stack-user              Opaque               5      3h1m
heat-keystone-test                    Opaque               9      3h1m
heat-keystone-trustee                 Opaque               9      3h1m
heat-keystone-user                    Opaque               9      3h1m
heat-rabbitmq-admin                   Opaque               1      3h1m
heat-rabbitmq-user                    Opaque               1      3h1m
keystone-credential-keys              Opaque               2      3h26m
keystone-db-admin                     Opaque               1      3h26m
keystone-db-user                      Opaque               1      3h26m
keystone-etc                          Opaque               10     3h26m
keystone-fernet-keys                  Opaque               2      3h26m
keystone-keystone-admin               Opaque               9      3h26m
keystone-keystone-test                Opaque               9      3h26m
keystone-rabbitmq-admin               Opaque               1      3h26m
keystone-rabbitmq-user                Opaque               1      3h26m
mariadb-dbadmin-password              Opaque               1      4h4m
mariadb-dbaudit-password              Opaque               1      4h4m
mariadb-dbsst-password                Opaque               1      4h4m
mariadb-secrets                       Opaque               2      4h4m
rabbitmq-admin-user                   Opaque               3      4h25m
rabbitmq-erlang-cookie                Opaque               1      4h25m
sh.helm.release.v1.cinder.v1          helm.sh/release.v1   1      50m
sh.helm.release.v1.glance.v1          helm.sh/release.v1   1      69m
sh.helm.release.v1.heat.v1            helm.sh/release.v1   1      3h1m
sh.helm.release.v1.ingress-nginx.v1   helm.sh/release.v1   1      3d3h
sh.helm.release.v1.keystone.v1        helm.sh/release.v1   1      3h26m
sh.helm.release.v1.mariadb.v1         helm.sh/release.v1   1      4h4m
sh.helm.release.v1.memcached.v1       helm.sh/release.v1   1      4h1m
sh.helm.release.v1.rabbitmq.v1        helm.sh/release.v1   1      4h25m
kcloud@kcloud-64:~/osh$
kcloud@kcloud-64:~/osh$ kubectl -n openstack create secret generic pvc-ceph-client-key \
  --type="kubernetes.io/rbd" \
  --from-literal=key=AQB04U9oTiF/LxAA+A2XWqmiQjNfyIUcNCPXgg==
secret/pvc-ceph-client-key created
kcloud@kcloud-64:~/osh$ kubectl delete pod -n openstack -l application=cinder
pod "cinder-api-64845fd466-bsrbs" deleted
pod "cinder-backup-5c65f87fd6-wslkr" deleted
pod "cinder-backup-storage-init-sftkc" deleted
pod "cinder-create-internal-tenant-npmbc" deleted
pod "cinder-db-init-5bgm7" deleted
pod "cinder-db-sync-hwl7m" deleted
pod "cinder-ks-endpoints-c2xx6" deleted
pod "cinder-ks-service-2v44b" deleted
pod "cinder-ks-user-pcrqm" deleted
pod "cinder-rabbit-init-8n4cb" deleted
pod "cinder-scheduler-7c7fdb4648-cjmx9" deleted
pod "cinder-storage-init-kzwcv" deleted
pod "cinder-volume-bc4d8f855-tl26q" deleted
pod "cinder-volume-usage-audit-29167745-pk6rv" deleted

```  


configmap (ceph-etc) / Key paring (/etc/ceph/keyring) 인증 문제로 지속 오류

```shell
# ceph 설정 파일 확보
kubectl -n ceph exec -it deploy/rook-ceph-tools -- cat /etc/ceph/ceph.conf > ceph.conf

kcloud@kcloud-64:~/osh$ cat ceph.conf
[global]
mon_host = 129.254.175.94:6789

[client.admin]
keyring = /etc/ceph/keyring


vim ceph.conf

> 
[global]
mon_host = 129.254.175.94:6789

[client.admin]
keyring = /etc/ceph/keyring

[client.cinder]
keyring = /tmp/client-keyring


kubectl -n openstack create configmap ceph-etc --from-file=ceph.conf=ceph.conf




# ceph에서 client.cinder 인증 키 확인
kubectl -n ceph exec -it deploy/rook-ceph-tools -- ceph auth get-key client.cinder

>
AQB04U9oTiF/LxAA+A2XWqmiQjNfyIUcNCPXgg==

# cinder.keyring
tee cinder.keyring <<EOF
[client.cinder]
  key = AQB04U9oTiF/LxAA+A2XWqmiQjNfyIUcNCPXgg==
  caps mon = "allow r"
  caps osd = "allow rwx pool=cinder"
EOF

kubectl -n openstack delete secret pvc-ceph-client-key

kubectl -n openstack create secret generic pvc-ceph-client-key \
  --from-file=keyring=cinder.keyring


# ~osh/override/cinder/cinder-ceph-auth.yaml
conf:
  ceph:
    enabled: true
    user: client.cinder
    keyring: /etc/ceph/keyring


helm upgrade --install cinder openstack-helm/cinder \
  --namespace=openstack \
  $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c cinder cinder-ceph-auth ${FEATURES})
```  



번외 
- ceph key 목록 출력 예

```shell
kcloud@kcloud-64:~/osh/openstack-helm/tools/deployment/ceph$ kubectl -n ceph exec -it deploy/rook-ceph-tools -- ceph auth ls
mds.cephfs-a
        key: AQBL90tookN7HhAA/Mt3d/8mxzrTCkjltSiT0g==
        caps: [mds] allow
        caps: [mon] allow profile mds
        caps: [osd] allow *
mds.cephfs-b
        key: AQBM90tok9j5BxAAQWrJUEJIZuo26Nm8+r2hQw==
        caps: [mds] allow
        caps: [mon] allow profile mds
        caps: [osd] allow *
osd.0
        key: AQAf90toIg1oHRAA8cej/kWKqkYfe+Szd4UDWA==
        caps: [mgr] allow profile osd
        caps: [mon] allow profile osd
        caps: [osd] allow *
osd.1
        key: AQA090towaDnDRAALjus5PahuAqZBfmbensMZQ==
        caps: [mgr] allow profile osd
        caps: [mon] allow profile osd
        caps: [osd] allow *
client.admin
        key: AQD59ktoYbLUFRAAQlFu4T9xfVBIqgkSbbVwKQ==
        caps: [mds] allow *
        caps: [mgr] allow *
        caps: [mon] allow *
        caps: [osd] allow *
client.bootstrap-mds
        key: AQAB90tohKcCKhAAU2rfVaDcm1sZXIlYvPvI4g==
        caps: [mon] allow profile bootstrap-mds
client.bootstrap-mgr
        key: AQAB90toC8gCKhAA3wisUT6GLE1ENFSB+LW/4g==
        caps: [mon] allow profile bootstrap-mgr
client.bootstrap-osd
        key: AQAB90toL+UCKhAALjOzSx4BSyByFs5MQDsPog==
        caps: [mon] allow profile bootstrap-osd
client.bootstrap-rbd
        key: AQAB90toFQMDKhAA3w+VFxRcL34gbiQiYvglmw==
        caps: [mon] allow profile bootstrap-rbd
client.bootstrap-rbd-mirror
        key: AQAB90toXiQDKhAAHaCgADGmCJsa1ffgXcpxpw==
        caps: [mon] allow profile bootstrap-rbd-mirror
client.bootstrap-rgw
        key: AQAB90tomUQDKhAAe0GlpLpuB3e1bmiH2zix6w==
        caps: [mon] allow profile bootstrap-rgw
client.ceph-exporter
        key: AQAF90toBJIiAhAAQByboupMbav3EYQlc96A1w==
        caps: [mds] allow r
        caps: [mgr] allow r
        caps: [mon] allow profile ceph-exporter
        caps: [osd] allow r
client.cinder
        key: AQB04U9oTiF/LxAA+A2XWqmiQjNfyIUcNCPXgg==
        caps: [mon] allow r
        caps: [osd] allow rwx pool=cinder
client.crash
        key: AQAE90toTsViJhAAhjYVlUhnTSKFnxtvXW8NKw==
        caps: [mgr] allow rw
        caps: [mon] allow profile crash
client.csi-cephfs-node
        key: AQAE90toovLuHBAApBaU3Aybvsc/dgm91sGeMQ==
        caps: [mds] allow rw
        caps: [mgr] allow rw
        caps: [mon] allow r
        caps: [osd] allow rw tag cephfs *=*
client.csi-cephfs-provisioner
        key: AQAE90tolu4pFBAAFr3HO0rAhrez+/1m9MtrLQ==
        caps: [mds] allow *
        caps: [mgr] allow rw
        caps: [mon] allow r, allow command 'osd blocklist'
        caps: [osd] allow rw tag cephfs metadata=*
client.csi-rbd-node
        key: AQAE90tofjdmCxAAVoKEaB73m+wlUfS0z6nTWg==
        caps: [mgr] allow rw
        caps: [mon] profile rbd
        caps: [osd] profile rbd
client.csi-rbd-provisioner
        key: AQAE90tofIHHAhAAabXkA/v9kALtYMIeYOr9Zw==
        caps: [mgr] allow rw
        caps: [mon] profile rbd, allow command 'osd blocklist'
        caps: [osd] profile rbd
client.rbd-mirror-peer
        key: AQAG90toy6J2BBAAUL+DwVN1NCethuX70XGWvg==
        caps: [mon] profile rbd-mirror-peer
        caps: [osd] profile rbd
client.rgw.default.a
        key: AQBt90touuJlExAADN55JKsix1NjiNq4ygrz+w==
        caps: [mon] allow rw
        caps: [osd] allow rwx
mgr.a
        key: AQAG90tooSYoDhAA5/QJSdOt+jvYYHWs+9vWIg==
        caps: [mds] allow *
        caps: [mon] allow profile mgr
        caps: [osd] allow *

```  

- logs 활용 디버깅 방법
  - templates/bin/_storage-init.sh.tlp
    ```shell
    set -ex
    if [ "x$STORAGE_BACKEND" == "xcinder.volume.drivers.rbd.RBDDriver" ]; then


    echo "[INFO] Checking if /tmp/client-keyring exists..."
    if [ -f /tmp/client-keyring ]; then
        echo "[INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring"
        cp /tmp/client-keyring /etc/ceph/keyring
        echo "[INFO] Copy complete. Verifying contents:"
        cat /etc/ceph/keyring
    else
        echo "[ERROR] /tmp/client-keyring not found!"
    fi

    echo "[INFO] Running ceph -s to verify cluster connection..."


    echo "[DEBUG] Showing /etc/ceph/ceph.conf:"
    cat /etc/ceph/ceph.conf || echo "[WARN] ceph.conf not found!"

    echo "[DEBUG] Showing /etc/ceph/keyring:"
    cat /etc/ceph/keyring || echo "[WARN] keyring not found!"

    echo "[DEBUG] Attempting ceph -s..."


    ceph -s

    ```

    ```shell
    # 출력 예
    kcloud@kcloud-64:~/osh$ kubectl logs -n openstack  cinder-storage-init-twb69
    Defaulted container "cinder-storage-init-rbd1" out of: cinder-storage-init-rbd1, init (init), ceph-keyring-placement (init)
    + '[' xcinder.volume.drivers.rbd.RBDDriver == xcinder.volume.drivers.rbd.RBDDriver ']'
    ++ mktemp --suffix .yaml
    + SECRET=/tmp/tmp.VDE5UGjOFn.yaml
    ++ mktemp --suffix .keyring
    + KEYRING=/tmp/tmp.ZO9YTWuFN6.keyring
    + trap cleanup EXIT
    + set -ex
    + '[' xcinder.volume.drivers.rbd.RBDDriver == xcinder.volume.drivers.rbd.RBDDriver ']'
    + echo '[INFO] Checking if /tmp/client-keyring exists...'
    [INFO] Checking if /tmp/client-keyring exists...
    + '[' -f /tmp/client-keyring ']'
    + echo '[INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring'
    [INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring
    + cp /tmp/client-keyring /etc/ceph/keyring
    + echo '[INFO] Copy complete. Verifying contents:'
    + cat /etc/ceph/keyring
    [INFO] Copy complete. Verifying contents:
    [client.admin]
            key = AQD59ktoYbLUFRAAQlFu4T9xfVBIqgkSbbVwKQ==
            caps mds = "allow *"
            caps mgr = "allow *"
            caps mon = "allow *"
            caps osd = "allow *"
    [INFO] Running ceph -s to verify cluster connection...
    [DEBUG] Showing /etc/ceph/ceph.conf:
    + echo '[INFO] Running ceph -s to verify cluster connection...'
    + echo '[DEBUG] Showing /etc/ceph/ceph.conf:'
    + cat /etc/ceph/ceph.conf
    [global]
    mon_host = 129.254.175.94:6789
    fsid = ca1a1180-0618-4584-b65c-cebcef1a507e
    auth_cluster_required = cephx
    auth_service_required = cephx
    auth_client_required = cephx
      
      
    [client.admin]
    keyring = /etc/ceph/keyrin  g
  
    + echo '[DEBUG] Showing /etc/ceph/keyring:'
    + cat /etc/ceph/keyring
    [DEBUG] Showing /etc/ceph/keyring:
    [client.admin]
            key = AQD59ktoYbLUFRAAQlFu4T9xfVBIqgkSbbVwKQ==
            caps mds = "allow *"
            caps mgr = "allow *"
            caps mon = "allow *"
            caps osd = "allow *"
    [DEBUG] Attempting ceph -s...
    + echo '[DEBUG] Attempting ceph -s...'
    + ceph -s
      cluster:
        id:     ca1a1180-0618-4584-b65c-cebcef1a507e
        health: HEALTH_O  K
  
      services:
        mon: 1 daemons, quorum a (age 3d)
        mgr: a(active, since 3d)
        mds: 1/1 daemons up, 1 standby
        osd: 2 osds: 2 up (since 3d), 2 in (since 3d)
        rgw: 1 daemon active (1 hosts, 1 zones  )
  
      data:
        volumes: 1/1 healthy
        pools:   12 pools, 169 pgs
        objects: 480 objects, 171 MiB
        usage:   518 MiB used, 23 GiB / 24 GiB avail
        pgs:     169 active+clea  n
  
      io:
        client:   8.3 KiB/s wr, 0 op/s rd, 1 op/s w  r
  
      + ensure_pool cinder.volumes 8 cinder-volume
      + ceph osd pool stats cinder.volumes
      Error ENOENT: unrecognized pool 'cinder.volumes'
      + ceph osd pool create cinder.volumes 8
      pool 'cinder.volumes' created
      ++ ceph mgr versions
      ++ awk '/version/{print $3}'
      ++ cut -d. -f1
      + [[ 19 -ge 12 ]]
      + ceph osd pool application enable cinder.volumes cinder-volume
      enabled application 'cinder-volume' on pool 'cinder.volumes'
      ++ ceph osd pool get cinder.volumes nosizechange
      ++ cut -f2 -d:
      ++ tr -d '[:space:]'
      + size_protection=false
      + ceph osd pool set cinder.volumes nosizechange 0
      set pool 13 nosizechange to 0
      + ceph osd pool set cinder.volumes size 3 --yes-i-really-mean-it
      set pool 13 size to 3
      + ceph osd pool set cinder.volumes nosizechange false
      set pool 13 nosizechange to false
      + ceph osd pool set cinder.volumes crush_rule replicated_rule
      set pool 13 crush_rule to replicated_rule
      ++ ceph auth get client.cinder
      + USERINFO='[client.cinder]
              key = AQAxF1FodrqHNRAAHsDfV8EoQfZM/1d4LbBj9A==
      Cephx user client.cinder already exist.
      Update its cephx caps
              caps mgr = "allow r"
              caps mon = "allow r, allow command status"
              caps osd = "profile rbd"'
      + echo 'Cephx user client.cinder already exist.'
      + echo 'Update its cephx caps'
      + ceph auth caps client.cinder mon 'profile rbd' osd 'profile rbd'
      updated caps for client.cinder
      [client.cinder]
              key = AQAxF1FodrqHNRAAHsDfV8EoQfZM/1d4LbBj9A==
              caps mon = "profile rbd"
              caps osd = "profile rbd"
      + ceph auth get client.cinder -o /tmp/tmp.ZO9YTWuFN6.keyring
      ++ base64 -w0
      ++ sed -n 's/^[[:blank:]]*key[[:blank:]]\+=[[:blank:]]\(.*\)/\1/p' /tmp/tmp.ZO9YTWuFN6.keyring
      + ENCODED_KEYRING=QVFBeEYxRm9kcnFITlJBQUhzRGZWOEVvUWZaTS8xZDRMYkJqOUE9PQo=
      + cat
      ++ echo QVFBeEYxRm9kcnFITlJBQUhzRGZWOEVvUWZaTS8xZDRMYkJqOUE9PQo=
      + kubectl apply --namespace openstack -f /tmp/tmp.VDE5UGjOFn.yaml
      secret/cinder-volume-rbd-keyring created
      + cleanup
      + rm -f /tmp/tmp.VDE5UGjOFn.yaml /tmp/tmp.ZO9YTWuFN6.keyring
  
      ```  

## libvirt - ceph (cinder) 연결 에러

### templates/bin/_ceph-keyring.sh.tpl

- libvirt Pod의 Init container 중 하나인 `ceph-keyring-placement` 컨테이너가 실행하는 스크립트
  - ceph.conf 구성 복사
  - keyring 파일 생성 여부 확인 (ceph auth get)
    - 없을 경우 get-or-create 시도

```shell
# 템플릿 파일을 ceph.conf로 복사
cp -fv /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf

# Keyring 생성 경로 설정
# 보통 CEPH_CINDER_USER=cinder 이므로, ceph.client.cinder.keyring 
KEYRING=/etc/ceph/ceph.client.${CEPH_CINDER_USER}.keyring

# helm 차트에서 .values.conf.ceph.cinder.keyring 값(base64아닌 실제 값)이 제공된 경우
{{- if .Values.conf.ceph.cinder.keyring }}
cat > ${KEYRING} <<EOF
[client.{{ .Values.conf.ceph.cinder.user }}]
    key = {{ .Values.conf.ceph.cinder.keyring }}
EOF

# helm 차트에서 값이 주어지지 않은 경우
# clinet.admin이 아닌 경우만 작업 수행
if ! [ "x${CEPH_CINDER_USER}" == "xadmin" ]; then
    # 인증 사용자 존재 여부 확인 후, 사용자가 없을 경우 생성 mon profile rbd, osd profiel rbd
    # ceph auth get client.cinder 는 ceph 클러스터에 접속해, client.cinder 유저가 있는지 조회
    # 존재하지 않는 경우 ceph auth get-or-create 명령 수행
    if USERINFO=$(ceph auth get client.${CEPH_CINDER_USER}); then
        # ceph mon에 연결하여 client.cinder 유저가 없으면 생성
        # 지정한 caps 권한 부여
        # 키 파일을 ${KEYRING}에 저장
        ceph auth get-or-create client.${CEPH_CINDER_USER} \
        mon "profile rbd" \
        osd "profile rbd" \
        -o ${KEYRING}

```  

- 📕 임시 수정
  - libvirt-libvirt-default-xxxx 포드의 경우, 위의 ceph-keyring.sh를 통해 key값을 저장하고, 이를 ceph 연결애 활용
  - 현재, Log를 살펴보면, /tmp/client-keyring은 Null 값
  - 따라서, ceph에 대한 인증이 제대로 이루어지지 않아 pod 생성 시, CrashLoopbackoff 발생함
  - secert의 key값을 가지고 keyring을 생성하는데, secret 값은 정상인 상태
  - 📕 따라서 client.admin의 key 및 권한 값을 ceph-keyring.sh에 하드코딩 
 
  ```shell
  # 오류나는 출력 예
  # cat의 값이 없음
  
  kcloud@kcloud-64:~/osh$ kubectl logs -n openstack libvirt-libvirt-default-hpj7c -c ceph-keyring-placement
  + export HOME=/tmp
  + HOME=/tmp
  + ls /tmp
  ceph-admin-keyring.sh
  ceph-keyring.sh
  client-keyring
  init-dynamic-options.sh
  pod-shared
  + ls -l /tmp
  total 8
  -rw-r--r-- 1 root root    0 Jun 18 06:49 ceph-admin-keyring.sh
  -r-xr-xr-x 1 root root 2052 Jun 18 06:49 ceph-keyring.sh
  -rw-r--r-- 1 root root    0 Jun 18 06:49 client-keyring
  -rw-r--r-- 1 root root    0 Jun 18 06:49 init-dynamic-options.sh
  drwxr-xr-x 2 root root 4096 Jun 18 06:49 pod-shared
  + ls /etc/ceph
  ceph.client.admin.keyring
  ceph.conf
  ceph.conf.template
  keyring
  + ls -l /etc/ceph
  total 12
  -rw-r--r-- 1 root root 176 Jun 18 06:49 ceph.client.admin.keyring
  -r--r--r-- 1 root root  91 Jun 18 06:49 ceph.conf
  -r--r--r-- 1 root root  91 Jun 18 06:49 ceph.conf.template
  -rw-r--r-- 1 root root   0 Jun 18 06:49 keyring
  + cat /tmp/client-keyring
  + cat /tmp/ceph-admin-keyring.sh
  + cat /tmp/ceph-keyring.sh
  #!/bin/bash
  
  
  
  set -ex
  export HOME=/tmp
  
  ls /tmp
  ls -l /tmp
  ls /etc/ceph
  ls -l /etc/ceph
  
  cat /tmp/client-keyring
  cat /tmp/ceph-admin-keyring.sh
  cat /tmp/ceph-keyring.sh
  
  cat -A /tmp/client-keyring
  
  # Copy ceph keyring
  if [ -f /tmp/client-keyring ]; then
    echo "[INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring"
    cp /tmp/client-keyring /etc/ceph/keyring
    echo "[INFO] Copy complete. Verifying contents:"
    cat /etc/ceph/keyring
  else
    echo "[ERROR] /tmp/client-keyring not found!"
    exit 1
  fi
  
  
  echo "[INFO] Copy complete. Verifying contents:"
  cat /etc/ceph/keyring
  
  + cat -A /tmp/client-keyring
  
  # Debug output
  echo "[DEBUG] /etc/ceph/ceph.conf contents:"
  cat /etc/ceph/ceph.conf || echo "[WARN] ceph.conf not found"
  
  echo "[DEBUG] /etc/ceph/keyring contents:"
  cat /etc/ceph/keyring || echo "[WARN] keyring not found"
  
  echo "[DEBUG] Running: ceph -s"
  ceph -n client.admin --keyring /etc/ceph/keyring -c /etc/ceph/ceph.conf -s || echo "[ERROR] ceph -s failed"
  
  echo "[DEBUG] Running: ceph auth list"
  ceph -n client.admin --keyring /etc/ceph/keyring -c /etc/ceph/ceph.conf auth list || echo "[ERROR] ceph auth list failed"
  
  cp -fv /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf
  
  KEYRING=/etc/ceph/ceph.client.${CEPH_CINDER_USER}.keyring
  if ! [ "x${CEPH_CINDER_USER}" == "xadmin" ]; then
    #
    # If user is not client.admin, check if it already exists. If not create
    # the user. If the cephx user does not exist make sure the caps are set
    # according to best practices
    #
    if USERINFO=$(ceph auth get client.${CEPH_CINDER_USER}); then
      echo "Cephx user client.${CEPH_CINDER_USER} already exist"
      echo "Update user client.${CEPH_CINDER_USER} caps"
      ceph auth caps client.${CEPH_CINDER_USER} \
         mon "profile rbd" \
         osd "profile rbd"
      ceph auth get client.${CEPH_CINDER_USER} -o ${KEYRING}
    else
      echo "Creating Cephx user client.${CEPH_CINDER_USER}"
      ceph auth get-or-create client.${CEPH_CINDER_USER} \
        mon "profile rbd" \
        osd "profile rbd" \
        -o ${KEYRING}
    fi
    rm -f /etc/ceph/ceph.client.admin.keyring
  fi
  + '[' -f /tmp/client-keyring ']'
  + echo '[INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring'
  + cp /tmp/client-keyring /etc/ceph/keyring
  [INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring
  + echo '[INFO] Copy complete. Verifying contents:'
  + cat /etc/ceph/keyring
  [INFO] Copy complete. Verifying contents:
  + echo '[INFO] Copy complete. Verifying contents:'
  + cat /etc/ceph/keyring
  [INFO] Copy complete. Verifying contents:
  [DEBUG] /etc/ceph/ceph.conf contents:
  + echo '[DEBUG] /etc/ceph/ceph.conf contents:'
  + cat /etc/ceph/ceph.conf
  [global]
  mon_host = 129.254.175.94:6789
  
  [client.admin]
  keyring = /etc/ceph/keyring
  
  [DEBUG] /etc/ceph/keyring contents:
  + echo '[DEBUG] /etc/ceph/keyring contents:'
  + cat /etc/ceph/keyring
  + echo '[DEBUG] Running: ceph -s'
  + ceph -n client.admin --keyring /etc/ceph/keyring -c /etc/ceph/ceph.conf -s
  [DEBUG] Running: ceph -s
  [errno 1] RADOS permission error (error connecting to the cluster)
  + echo '[ERROR] ceph -s failed'
  + echo '[DEBUG] Running: ceph auth list'
  [ERROR] ceph -s failed
  [DEBUG] Running: ceph auth list
  + ceph -n client.admin --keyring /etc/ceph/keyring -c /etc/ceph/ceph.conf auth list
  [errno 1] RADOS permission error (error connecting to the cluster)
  + echo '[ERROR] ceph auth list failed'
  [ERROR] ceph auth list failed
  + cp -fv /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf
  '/etc/ceph/ceph.conf.template' -> '/etc/ceph/ceph.conf'
  + KEYRING=/etc/ceph/ceph.client.cinder.keyring
  + '[' xcinder == xadmin ']'
  ++ ceph auth get client.cinder
  [errno 1] RADOS permission error (error connecting to the cluster)
  + USERINFO=
  + echo 'Creating Cephx user client.cinder'
  Creating Cephx user client.cinder
  + ceph auth get-or-create client.cinder mon 'profile rbd' osd 'profile rbd' -o /etc/ceph/ceph.client.cinder.keyring
  [errno 1] RADOS permission error (error connecting to the cluster)


  ```

  ```shell
  #!/bin/bash

  {{/*
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at
  
     http://www.apache.org/licenses/LICENSE-2.0
  
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
  */}}
  
  set -ex
  export HOME=/tmp
  
  cat <<EOF > /tmp/client-keyring
  [client.admin]
    key = AQD59ktoYbLUFRAAQlFu4T9xfVBIqgkSbbVwKQ==
    caps mds = "allow *"
    caps mgr = "allow *"
    caps mon = "allow *"
    caps osd = "allow *"
  EOF
  
  ls /tmp
  ls -l /tmp
  ls /etc/ceph
  ls -l /etc/ceph
  
  cat /tmp/client-keyring
  cat /tmp/ceph-admin-keyring.sh
  cat /tmp/ceph-keyring.sh
  
  cat -A /tmp/client-keyring
  
  # Copy ceph keyring
  if [ -f /tmp/client-keyring ]; then
    echo "[INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring"
    cp /tmp/client-keyring /etc/ceph/keyring
    echo "[INFO] Copy complete. Verifying contents:"
    cat /etc/ceph/keyring
  else
    echo "[ERROR] /tmp/client-keyring not found!"
    exit 1
  fi
  
  echo "[INFO] Copy complete. Verifying contents:"
  cat /etc/ceph/keyring
  
  
  # Debug output
  echo "[DEBUG] /etc/ceph/ceph.conf contents:"
  cat /etc/ceph/ceph.conf || echo "[WARN] ceph.conf not found"
  
  echo "[DEBUG] /etc/ceph/keyring contents:"
  cat /etc/ceph/keyring || echo "[WARN] keyring not found"
  
  echo "[DEBUG] Running: ceph -s"
  ceph -n client.admin --keyring /etc/ceph/keyring -c /etc/ceph/ceph.conf -s || echo "[ERROR] ceph -s failed"
  
  echo "[DEBUG] Running: ceph auth list"
  ceph -n client.admin --keyring /etc/ceph/keyring -c /etc/ceph/ceph.conf auth list || echo "[ERROR] ceph auth list failed"
  
  cp -fv /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf

  ```

### rook-ceph-tool 로 ceph 사용자 권한 변경

```shell
kcloud@kcloud-64:~/osh$ kubectl -n ceph exec deploy/rook-ceph-tools -- ceph auth list
mds.cephfs-a
        key: AQBL90tookN7HhAA/Mt3d/8mxzrTCkjltSiT0g==
        caps: [mds] allow
        caps: [mon] allow profile mds
        caps: [osd] allow *
mds.cephfs-b
        key: AQBM90tok9j5BxAAQWrJUEJIZuo26Nm8+r2hQw==
        caps: [mds] allow
        caps: [mon] allow profile mds
        caps: [osd] allow *
osd.0
        key: AQAf90toIg1oHRAA8cej/kWKqkYfe+Szd4UDWA==
        caps: [mgr] allow profile osd
        caps: [mon] allow profile osd
        caps: [osd] allow *
osd.1
        key: AQA090towaDnDRAALjus5PahuAqZBfmbensMZQ==
        caps: [mgr] allow profile osd
        caps: [mon] allow profile osd
        caps: [osd] allow *
client.admin
        key: AQD59ktoYbLUFRAAQlFu4T9xfVBIqgkSbbVwKQ==
        caps: [mds] allow *
        caps: [mgr] allow *
        caps: [mon] allow *
        caps: [osd] allow *
client.bootstrap-mds
        key: AQAB90tohKcCKhAAU2rfVaDcm1sZXIlYvPvI4g==
        caps: [mon] allow profile bootstrap-mds
client.bootstrap-mgr
        key: AQAB90toC8gCKhAA3wisUT6GLE1ENFSB+LW/4g==
        caps: [mon] allow profile bootstrap-mgr
client.bootstrap-osd
        key: AQAB90toL+UCKhAALjOzSx4BSyByFs5MQDsPog==
        caps: [mon] allow profile bootstrap-osd
client.bootstrap-rbd
        key: AQAB90toFQMDKhAA3w+VFxRcL34gbiQiYvglmw==
        caps: [mon] allow profile bootstrap-rbd
client.bootstrap-rbd-mirror
        key: AQAB90toXiQDKhAAHaCgADGmCJsa1ffgXcpxpw==
        caps: [mon] allow profile bootstrap-rbd-mirror
client.bootstrap-rgw
        key: AQAB90tomUQDKhAAe0GlpLpuB3e1bmiH2zix6w==
        caps: [mon] allow profile bootstrap-rgw
client.ceph-exporter
        key: AQAF90toBJIiAhAAQByboupMbav3EYQlc96A1w==
        caps: [mds] allow r
        caps: [mgr] allow r
        caps: [mon] allow profile ceph-exporter
        caps: [osd] allow r
client.cinder
        key: AQAxF1FodrqHNRAAHsDfV8EoQfZM/1d4LbBj9A==
        caps: [mon] profile rbd
        caps: [osd] profile rbd
client.crash
        key: AQAE90toTsViJhAAhjYVlUhnTSKFnxtvXW8NKw==
        caps: [mgr] allow rw
        caps: [mon] allow profile crash
client.csi-cephfs-node
        key: AQAE90toovLuHBAApBaU3Aybvsc/dgm91sGeMQ==
        caps: [mds] allow rw
        caps: [mgr] allow rw
        caps: [mon] allow r
        caps: [osd] allow rw tag cephfs *=*
client.csi-cephfs-provisioner
        key: AQAE90tolu4pFBAAFr3HO0rAhrez+/1m9MtrLQ==
        caps: [mds] allow *
        caps: [mgr] allow rw
        caps: [mon] allow r, allow command 'osd blocklist'
        caps: [osd] allow rw tag cephfs metadata=*
client.csi-rbd-node
        key: AQAE90tofjdmCxAAVoKEaB73m+wlUfS0z6nTWg==
        caps: [mgr] allow rw
        caps: [mon] profile rbd
        caps: [osd] profile rbd
client.csi-rbd-provisioner
        key: AQAE90tofIHHAhAAabXkA/v9kALtYMIeYOr9Zw==
        caps: [mgr] allow rw
        caps: [mon] profile rbd, allow command 'osd blocklist'
        caps: [osd] profile rbd
client.rbd-mirror-peer
        key: AQAG90toy6J2BBAAUL+DwVN1NCethuX70XGWvg==
        caps: [mon] profile rbd-mirror-peer
        caps: [osd] profile rbd
client.rgw.default.a
        key: AQBt90touuJlExAADN55JKsix1NjiNq4ygrz+w==
        caps: [mon] allow rw
        caps: [osd] allow rwx
mgr.a
        key: AQAG90tooSYoDhAA5/QJSdOt+jvYYHWs+9vWIg==
        caps: [mds] allow *
        caps: [mon] allow profile mgr
        caps: [osd] allow *
kcloud@kcloud-64:~/osh$ kubectl -n ceph exec deploy/rook-ceph-tools --
^C
kcloud@kcloud-64:~/osh$ kubectl -n ceph exec deploy/rook-ceph-tools -- ceph auth caps client.cinder \
  mon "allow *" \
  osd "allow *" \
  mgr "allow *" \
  mds "allow *"
[client.cinder]
        key = AQAxF1FodrqHNRAAHsDfV8EoQfZM/1d4LbBj9A==
        caps mds = "allow *"
        caps mgr = "allow *"
        caps mon = "allow *"
        caps osd = "allow *"
updated caps for client.cinder
kcloud@kcloud-64:~/osh$ kubectl -n ceph exec deploy/rook-ceph-tools -- ceph auth list
mds.cephfs-a
        key: AQBL90tookN7HhAA/Mt3d/8mxzrTCkjltSiT0g==
        caps: [mds] allow
        caps: [mon] allow profile mds
        caps: [osd] allow *
mds.cephfs-b
        key: AQBM90tok9j5BxAAQWrJUEJIZuo26Nm8+r2hQw==
        caps: [mds] allow
        caps: [mon] allow profile mds
        caps: [osd] allow *
osd.0
        key: AQAf90toIg1oHRAA8cej/kWKqkYfe+Szd4UDWA==
        caps: [mgr] allow profile osd
        caps: [mon] allow profile osd
        caps: [osd] allow *
osd.1
        key: AQA090towaDnDRAALjus5PahuAqZBfmbensMZQ==
        caps: [mgr] allow profile osd
        caps: [mon] allow profile osd
        caps: [osd] allow *
client.admin
        key: AQD59ktoYbLUFRAAQlFu4T9xfVBIqgkSbbVwKQ==
        caps: [mds] allow *
        caps: [mgr] allow *
        caps: [mon] allow *
        caps: [osd] allow *
client.bootstrap-mds
        key: AQAB90tohKcCKhAAU2rfVaDcm1sZXIlYvPvI4g==
        caps: [mon] allow profile bootstrap-mds
client.bootstrap-mgr
        key: AQAB90toC8gCKhAA3wisUT6GLE1ENFSB+LW/4g==
        caps: [mon] allow profile bootstrap-mgr
client.bootstrap-osd
        key: AQAB90toL+UCKhAALjOzSx4BSyByFs5MQDsPog==
        caps: [mon] allow profile bootstrap-osd
client.bootstrap-rbd
        key: AQAB90toFQMDKhAA3w+VFxRcL34gbiQiYvglmw==
        caps: [mon] allow profile bootstrap-rbd
client.bootstrap-rbd-mirror
        key: AQAB90toXiQDKhAAHaCgADGmCJsa1ffgXcpxpw==
        caps: [mon] allow profile bootstrap-rbd-mirror
client.bootstrap-rgw
        key: AQAB90tomUQDKhAAe0GlpLpuB3e1bmiH2zix6w==
        caps: [mon] allow profile bootstrap-rgw
client.ceph-exporter
        key: AQAF90toBJIiAhAAQByboupMbav3EYQlc96A1w==
        caps: [mds] allow r
        caps: [mgr] allow r
        caps: [mon] allow profile ceph-exporter
        caps: [osd] allow r
client.cinder
        key: AQAxF1FodrqHNRAAHsDfV8EoQfZM/1d4LbBj9A==
        caps: [mds] allow *
        caps: [mgr] allow *
        caps: [mon] allow *
        caps: [osd] allow *
client.crash
        key: AQAE90toTsViJhAAhjYVlUhnTSKFnxtvXW8NKw==
        caps: [mgr] allow rw
        caps: [mon] allow profile crash
client.csi-cephfs-node
        key: AQAE90toovLuHBAApBaU3Aybvsc/dgm91sGeMQ==
        caps: [mds] allow rw
        caps: [mgr] allow rw
        caps: [mon] allow r
        caps: [osd] allow rw tag cephfs *=*
client.csi-cephfs-provisioner
        key: AQAE90tolu4pFBAAFr3HO0rAhrez+/1m9MtrLQ==
        caps: [mds] allow *
        caps: [mgr] allow rw
        caps: [mon] allow r, allow command 'osd blocklist'
        caps: [osd] allow rw tag cephfs metadata=*
client.csi-rbd-node
        key: AQAE90tofjdmCxAAVoKEaB73m+wlUfS0z6nTWg==
        caps: [mgr] allow rw
        caps: [mon] profile rbd
        caps: [osd] profile rbd
client.csi-rbd-provisioner
        key: AQAE90tofIHHAhAAabXkA/v9kALtYMIeYOr9Zw==
        caps: [mgr] allow rw
        caps: [mon] profile rbd, allow command 'osd blocklist'
        caps: [osd] profile rbd
client.rbd-mirror-peer
        key: AQAG90toy6J2BBAAUL+DwVN1NCethuX70XGWvg==
        caps: [mon] profile rbd-mirror-peer
        caps: [osd] profile rbd
client.rgw.default.a
        key: AQBt90touuJlExAADN55JKsix1NjiNq4ygrz+w==
        caps: [mon] allow rw
        caps: [osd] allow rwx
mgr.a
        key: AQAG90tooSYoDhAA5/QJSdOt+jvYYHWs+9vWIg==
        caps: [mds] allow *
        caps: [mon] allow profile mgr
        caps: [osd] allow *

``` 

## rook-ceph-tool, nova keyring 문제

- ~/osh/openstack-helm/nova/templates/bin/_ceph-keyring.sh.tpl
  - 파일 수정
  - ceph 명령어를 실행하기 위해 ceph.conf, keyring의 경로에 문제 있음
  - sh에서 생성하는 /etc/ceph/ceph.client.admin.keyring 을 그대로 /etc/ceph/keyring 으로 활용하도록 강제 변경
```shell
set -ex
export HOME=/tmp

cat /etc/ceph/ceph.conf.template

ls -l /tmp
ls -l /etc/ceph
cat /tmp/client-keyring
cat /etc/ceph/ceph.client.admin.keyring

cp -vf /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf
cp /etc/ceph/ceph.client.admin.keyring /etc/ceph/keyring

cat /etc/ceph/ceph.conf
echo ${CEPH_CINDER_USER}

ls /tmp
ls /etc/ceph
cat /etc/ceph/keyring

KEYRING=/etc/ceph/ceph.client.${CEPH_CINDER_USER}.keyring
{{- if .Values.conf.ceph.cinder.keyring }}
cat > ${KEYRING} <<EOF
[client.{{ .Values.conf.ceph.cinder.user }}]
    key = {{ .Values.conf.ceph.cinder.keyring }}
EOF
```

```shell
# logs
kcloud@kcloud-64:~/osh$ kubectl logs -n openstack nova-compute-default-fwd2f -c ceph-keyring-placement
+ export HOME=/tmp
+ HOME=/tmp
+ cat /etc/ceph/ceph.conf.template
[global]
mon_host = 129.254.175.94:6789

[client.admin]
keyring = /etc/ceph/keyring

+ ls -l /tmp
total 8
-rw-r--r-- 1 root root    0 Jun 18 07:49 ceph-admin-keyring.sh
-r-xr-xr-x 1 root root 1260 Jun 18 07:49 ceph-keyring.sh
-rw-r--r-- 1 root root    0 Jun 18 07:49 client-keyring
-rw-r--r-- 1 root root    0 Jun 18 07:49 nova-compute-init.sh
drwxr-xr-x 2 root root 4096 Jun 18 07:49 pod-shared
+ ls -l /etc/ceph
total 12
-rw-r--r-- 1 nova nova 176 Jun 18 07:49 ceph.client.admin.keyring
-r--r--r-- 1 nova nova  91 Jun 18 07:48 ceph.conf
-r--r--r-- 1 root root  91 Jun 18 07:49 ceph.conf.template
-rw-r--r-- 1 nova nova   0 Jun 18 07:46 keyring
+ cat /tmp/client-keyring
+ cat /etc/ceph/ceph.client.admin.keyring
[client.admin]
    key = [client.admin]
 key = AQD59ktoYbLUFRAAQlFu4T9xfVBIqgkSbbVwKQ==
 caps mds = "allow *"
 caps mgr = "allow *"
 caps mon = "allow *"
 caps osd = "allow *"
+ cp -vf /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf
'/etc/ceph/ceph.conf.template' -> '/etc/ceph/ceph.conf'
removed '/etc/ceph/ceph.conf'
+ cp /etc/ceph/ceph.client.admin.keyring /etc/ceph/keyring
+ cat /etc/ceph/ceph.conf
[global]
mon_host = 129.254.175.94:6789

[client.admin]
keyring = /etc/ceph/keyring

+ echo cinder
+ ls /tmp
cinder
ceph-admin-keyring.sh
ceph-keyring.sh
client-keyring
nova-compute-init.sh
pod-shared
+ ls /etc/ceph
ceph.client.admin.keyring
ceph.conf
ceph.conf.template
keyring
+ cat /etc/ceph/keyring
[client.admin]
    key = [client.admin]
 key = AQD59ktoYbLUFRAAQlFu4T9xfVBIqgkSbbVwKQ==
 caps mds = "allow *"
 caps mgr = "allow *"
 caps mon = "allow *"
 caps osd = "allow *"
+ KEYRING=/etc/ceph/ceph.client.cinder.keyring
+ '[' xcinder == xadmin ']'
++ ceph auth get client.cinder
+ USERINFO='[client.cinder]
        key = AQAxF1FodrqHNRAAHsDfV8EoQfZM/1d4LbBj9A==
Cephx user client.cinder already exist
        caps mon = "profile rbd"
        caps osd = "profile rbd"'
Update user client.cinder caps
+ echo 'Cephx user client.cinder already exist'
+ echo 'Update user client.cinder caps'
+ ceph auth caps client.cinder mon 'profile rbd' osd 'profile rbd'
updated caps for client.cinder
[client.cinder]
        key = AQAxF1FodrqHNRAAHsDfV8EoQfZM/1d4LbBj9A==
        caps mon = "profile rbd"
        caps osd = "profile rbd"
+ ceph auth get client.cinder -o /etc/ceph/ceph.client.cinder.keyring
+ rm -f /etc/ceph/ceph.client.admin.keyring

```  



## rook-ceph-tool, libvirt keyring 문제 (nova와 비슷하게 다시 수정)


```shell
# sh.tpl

set -ex
export HOME=/tmp

ls -l /tmp
ls -l /etc/ceph

cat /tmp/client-keyring
cat /etc/ceph/ceph.client.admin.keyring
cat /etc/ceph/ceph.conf
cat /etc/ceph/ceph.conf.template
cat /etc/ceph/keyring


# Copy ceph keyring
#if [ -f /tmp/client-keyring ]; then
#  echo "[INFO] Found /tmp/client-keyring, copying to /etc/ceph/keyring"
#  cp /tmp/client-keyring /etc/ceph/keyring
#  echo "[INFO] Copy complete. Verifying contents:"
#  cat /etc/ceph/keyring
#else
#  echo "[ERROR] /tmp/client-keyring not found!"
#  exit 1
#fi

cp -fv /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf

KEYRING=/etc/ceph/ceph.client.${CEPH_CINDER_USER}.keyring


# logs

kcloud@kcloud-64:~$ kubectl logs -n openstack libvirt-libvirt-default-nq9hl -c ceph-keyring-placement
+ export HOME=/tmp
+ HOME=/tmp
+ ls -l /tmp
total 8
-rw-r--r-- 1 root root    0 Jun 19 06:05 ceph-admin-keyring.sh
-r-xr-xr-x 1 root root 1476 Jun 19 06:04 ceph-keyring.sh
-rw-r--r-- 1 root root    0 Jun 19 06:05 client-keyring
-rw-r--r-- 1 root root    0 Jun 19 06:05 init-dynamic-options.sh
drwxr-xr-x 2 root root 4096 Jun 19 06:05 pod-shared
+ ls -l /etc/ceph
total 12
-rw-r--r-- 1 root root 176 Jun 19 06:05 ceph.client.admin.keyring
-r--r--r-- 1 root root  84 Jun 19 06:05 ceph.conf
-r--r--r-- 1 root root  84 Jun 19 06:04 ceph.conf.template
-rw-r--r-- 1 root root   0 Jun 19 06:01 keyring
+ cat /tmp/client-keyring
+ cat /etc/ceph/ceph.client.admin.keyring
[client.admin]
    key = [client.admin]
        key = AQBaklNooB6MLhAAJ4L/HqiWg37RryeNBmLL4A==
        caps mds = "allow *"
        caps mgr = "allow *"
        caps mon = "allow *"
        caps osd = "allow *"
+ cat /etc/ceph/ceph.conf
[global]
mon_host = 129.254.175.93:6789

[client.admin]
keyring = /etc/ceph/keyring
+ cat /etc/ceph/ceph.conf.template
[global]
mon_host = 129.254.175.93:6789

[client.admin]
keyring = /etc/ceph/keyring
+ cat /etc/ceph/keyring
+ cp -fv /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf
'/etc/ceph/ceph.conf.template' -> '/etc/ceph/ceph.conf'
+ KEYRING=/etc/ceph/ceph.client.cinder.keyring
+ '[' xcinder == xadmin ']'
++ ceph auth get client.cinder
[errno 1] RADOS permission error (error connecting to the cluster)
+ USERINFO=
+ echo 'Creating Cephx user client.cinder'
Creating Cephx user client.cinder
+ ceph auth get-or-create client.cinder mon 'profile rbd' osd 'profile rbd' -o /etc/ceph/ceph.client.cinder.keyring
[errno 1] RADOS permission error (error connecting to the cluster)

```  

`cp /etc/ceph/ceph.client.admin.keyring /etc/ceph/keyring` 추가


```shell
# 수정
set -ex
export HOME=/tmp

# 추가
cp /etc/ceph/ceph.client.admin.keyring /etc/ceph/keyring

cp -fv /etc/ceph/ceph.conf.template /etc/ceph/ceph.conf
```  


## openstack client 접근(네트워크문제)

```shell

kcloud@kcloud-64:~/osh$ source ~/openstack-client/bin/activate
(openstack-client) kcloud@kcloud-64:~/osh$ openstack --os-cloud openstack_helm endpoint list
Failed to discover available identity versions when contacting http://keystone.openstack.svc.cluster.local/v3. Attempting to parse version from URL.
Unable to establish connection to http://keystone.openstack.svc.cluster.local/v3/auth/tokens: HTTPConnectionPool(host='keystone.openstack.svc.cluster.local', port=80): Max retries exceeded with url: /v3/auth/tokens (Caused by NameResolutionError("<urllib3.connection.HTTPConnection object at 0x7f1782b329b0>: Failed to resolve 'keystone.openstack.svc.cluster.local' ([Errno -2] Name or service not known)"))

```  

```shell
# svc

(openstack-client) kcloud@kcloud-64:~/osh$ kubectl get svc -o wide
NAME         TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE    SELECTOR
kubernetes   ClusterIP   10.96.0.1    <none>        443/TCP   124m   <none>
(openstack-client) kcloud@kcloud-64:~/osh$ kubectl get svc -o wide -n openstack
NAME                  TYPE           CLUSTER-IP      EXTERNAL-IP      PORT(S)                                  AGE     SELECTOR
cinder                ClusterIP      10.96.38.156    <none>           80/TCP,443/TCP                           47m     app=ingress-api
cinder-api            ClusterIP      10.96.193.147   <none>           8776/TCP                                 47m     app.kubernetes.io/component=api,app.kubernetes.io/instance=cinder,app.kubernetes.io/name=cinder,application=cinder,component=api,release_group=cinder
cloudformation        ClusterIP      10.96.4.7       <none>           80/TCP,443/TCP                           57m     app=ingress-api
glance                ClusterIP      10.96.97.0      <none>           80/TCP,443/TCP                           54m     app=ingress-api
glance-api            ClusterIP      10.96.59.218    <none>           9292/TCP                                 54m     app.kubernetes.io/component=api,app.kubernetes.io/instance=glance,app.kubernetes.io/name=glance,application=glance,component=api,release_group=glance
heat                  ClusterIP      10.96.43.226    <none>           80/TCP,443/TCP                           57m     app=ingress-api
heat-api              ClusterIP      10.96.221.171   <none>           8004/TCP                                 57m     app.kubernetes.io/component=api,app.kubernetes.io/instance=heat,app.kubernetes.io/name=heat,application=heat,component=api,release_group=heat
heat-cfn              ClusterIP      10.96.145.75    <none>           8000/TCP                                 57m     app.kubernetes.io/component=cfn,app.kubernetes.io/instance=heat,app.kubernetes.io/name=heat,application=heat,component=cfn,release_group=heat
horizon               ClusterIP      10.96.41.47     <none>           80/TCP,443/TCP                           5m38s   app=ingress-api
horizon-int           ClusterIP      10.96.196.247   <none>           80/TCP                                   5m38s   app.kubernetes.io/component=server,app.kubernetes.io/instance=horizon,app.kubernetes.io/name=horizon,application=horizon,component=server,release_group=horizon
keystone              ClusterIP      10.96.70.253    <none>           80/TCP,443/TCP                           61m     app=ingress-api
keystone-api          ClusterIP      10.96.5.227     <none>           5000/TCP                                 61m     app.kubernetes.io/component=api,app.kubernetes.io/instance=keystone,app.kubernetes.io/name=keystone,application=keystone,component=api,release_group=keystone
mariadb               ClusterIP      10.96.176.74    <none>           3306/TCP                                 71m     app.kubernetes.io/component=server,app.kubernetes.io/instance=mariadb,app.kubernetes.io/name=mariadb,application=mariadb,component=server,release_group=mariadb,statefulset.kubernetes.io/pod-name=mariadb-server-0
mariadb-discovery     ClusterIP      None            <none>           3306/TCP,4567/TCP,4568/TCP,4444/TCP      71m     app.kubernetes.io/component=server,app.kubernetes.io/instance=mariadb,app.kubernetes.io/name=mariadb,application=mariadb,component=server,release_group=mariadb
mariadb-server        ClusterIP      10.96.112.131   <none>           3306/TCP                                 71m     app.kubernetes.io/component=server,app.kubernetes.io/instance=mariadb,app.kubernetes.io/name=mariadb,application=mariadb,component=server,release_group=mariadb
memcached             ClusterIP      10.96.236.130   <none>           11211/TCP                                68m     app.kubernetes.io/component=server,app.kubernetes.io/instance=memcached,app.kubernetes.io/name=memcached,application=memcached,component=server,release_group=memcached
metadata              ClusterIP      10.96.236.131   <none>           80/TCP,443/TCP                           34m     app=ingress-api
neutron               ClusterIP      10.96.43.123    <none>           80/TCP,443/TCP                           29m     app=ingress-api
neutron-server        ClusterIP      10.96.42.184    <none>           9696/TCP                                 29m     app.kubernetes.io/component=server,app.kubernetes.io/instance=neutron,app.kubernetes.io/name=neutron,application=neutron,component=server,release_group=neutron
nova                  ClusterIP      10.96.130.222   <none>           80/TCP,443/TCP                           34m     app=ingress-api
nova-api              ClusterIP      10.96.176.142   <none>           8774/TCP                                 34m     app.kubernetes.io/component=os-api,app.kubernetes.io/instance=nova,app.kubernetes.io/name=nova,application=nova,component=os-api,release_group=nova
nova-metadata         ClusterIP      10.96.235.216   <none>           8775/TCP                                 34m     app.kubernetes.io/component=metadata,app.kubernetes.io/instance=nova,app.kubernetes.io/name=nova,application=nova,component=metadata,release_group=nova
nova-novncproxy       ClusterIP      10.96.131.99    <none>           6080/TCP                                 34m     app.kubernetes.io/component=novnc-proxy,app.kubernetes.io/instance=nova,app.kubernetes.io/name=nova,application=nova,component=novnc-proxy,release_group=nova
novncproxy            ClusterIP      10.96.193.94    <none>           80/TCP,443/TCP                           34m     app=ingress-api
placement             ClusterIP      10.96.191.173   <none>           80/TCP,443/TCP                           36m     app=ingress-api
placement-api         ClusterIP      10.96.150.145   <none>           8778/TCP                                 36m     app.kubernetes.io/component=api,app.kubernetes.io/instance=placement,app.kubernetes.io/name=placement,application=placement,component=api,release_group=placement
public-openstack      LoadBalancer   10.96.234.5     172.24.128.100   80:30489/TCP,443:31640/TCP               119m    app=ingress-api
rabbitmq              ClusterIP      None            <none>           5672/TCP,25672/TCP,15672/TCP,15692/TCP   93m     app.kubernetes.io/component=server,app.kubernetes.io/instance=rabbitmq,app.kubernetes.io/name=rabbitmq,application=rabbitmq,component=server,release_group=rabbitmq
rabbitmq-mgr-7b1733   ClusterIP      10.96.87.0      <none>           80/TCP,443/TCP                           93m     app=ingress-api

```  

Neutron 설치 후, Worker Node의 인터넷 연결 문제
- openstack-helm의 `neutron-ovs-agent`는 `auto_bridge_add`로 br-ex를 만들고, 인터페이스를 붙임
- 단, 이 때 OS 수준의 `default route`는 설정하지 않음
- 따라서, 수동으로 추가하거나 cloud-init, systemd, helm pre/post hook 등에 넣어야 함
- br-ex
  - external bridge
  - openstack 네트워크에서 VM이 외부(물리 네트워크/인터넷)와 통신할 수 있도록 하는 브릿지
  - provider interface (노드 host interface)에 붙여서
  - VM의 floating IP - 실제 외부 네트워크 - 인터넷 사이에 NAT 및 패킷 포워딩 수행
  - 주로 flat 또는 provider network (external)에 사용
    - br-ex에 IP가 부여되고 default gateway가 지정되어 있어야 노드도 외부로 통신 가능
- tunl0x 는 Calico CNI에서 사용하는 IP-in-IP 터널 인터페이스
  - K8s pod to pod 통신이 다른 노드간에도 되게하기 위함


```shell
# 인터넷이 되지 않는 상황 예
kcloud@kcloud-93:~$ ip r
blackhole 10.244.0.192/26 proto bird
10.244.0.194 dev cali4082d6067b4 scope link
10.244.0.200 dev calia428d75e0c6 scope link
10.244.0.201 dev calie4de4a1e3a9 scope link
10.244.0.203 dev cali30a5d23e521 scope link
10.244.103.0/26 via 129.254.175.94 dev tunl0 proto bird onlink
129.254.175.0/24 dev br-ex proto kernel scope link src 129.254.175.93
172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown
172.24.5.0/24 dev client-wg proto kernel scope link src 172.24.5.1
kcloud@kcloud-93:~$ ip link show
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
2: enp4s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel master ovs-system state UP mode DEFAULT group default qlen 1000
    link/ether 1c:69:7a:0a:6d:ee brd ff:ff:ff:ff:ff:ff
    altname enp0s31f6
3: wlp0s20f3: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN mode DORMANT group default qlen 1000
    link/ether 04:ea:56:48:1e:1c brd ff:ff:ff:ff:ff:ff
4: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN mode DEFAULT group default
    link/ether 46:4f:65:23:bc:11 brd ff:ff:ff:ff:ff:ff
5: kube-ipvs0: <BROADCAST,NOARP> mtu 1500 qdisc noop state DOWN mode DEFAULT group default
    link/ether fe:10:a3:5f:37:2f brd ff:ff:ff:ff:ff:ff
7: cali4082d6067b4@if2: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT group default qlen 1000
    link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff link-netns cni-b800f927-5acb-af4f-8f4e-3530881e01c7
9: tunl0@NONE: <NOARP,UP,LOWER_UP> mtu 1480 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/ipip 0.0.0.0 brd 0.0.0.0
14: client-wg: <POINTOPOINT,NOARP,UP,LOWER_UP> mtu 1420 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/none
19: calia428d75e0c6@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1480 qdisc noqueue state UP mode DEFAULT group default qlen 1000
    link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff link-netns cni-d5beccad-1508-f6ff-a667-2e2b56f1a043
20: calie4de4a1e3a9@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1480 qdisc noqueue state UP mode DEFAULT group default qlen 1000
    link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff link-netns cni-fe523173-2666-0f71-0360-f247fb83f98a
22: ovs-system: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 42:4d:5b:00:97:5c brd ff:ff:ff:ff:ff:ff
23: br-ex: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/ether 1c:69:7a:0a:6d:ee brd ff:ff:ff:ff:ff:ff
24: cali30a5d23e521@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1480 qdisc noqueue state UP mode DEFAULT group default qlen 1000
    link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff link-netns cni-d66425a5-9093-cd0e-0ea2-e5bf01bb3206
kcloud@kcloud-93:~$ route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
10.244.0.192    0.0.0.0         255.255.255.192 U     0      0        0 *
10.244.0.194    0.0.0.0         255.255.255.255 UH    0      0        0 cali4082d6067b4
10.244.0.200    0.0.0.0         255.255.255.255 UH    0      0        0 calia428d75e0c6
10.244.0.201    0.0.0.0         255.255.255.255 UH    0      0        0 calie4de4a1e3a9
10.244.0.203    0.0.0.0         255.255.255.255 UH    0      0        0 cali30a5d23e521
10.244.103.0    129.254.175.94  255.255.255.192 UG    0      0        0 tunl0
129.254.175.0   0.0.0.0         255.255.255.0   U     0      0        0 br-ex
172.17.0.0      0.0.0.0         255.255.0.0     U     0      0        0 docker0
172.24.5.0      0.0.0.0         255.255.255.0   U     0      0        0 client-wg
kcloud@kcloud-93:~$ ip route
blackhole 10.244.0.192/26 proto bird
10.244.0.194 dev cali4082d6067b4 scope link
10.244.0.200 dev calia428d75e0c6 scope link
10.244.0.201 dev calie4de4a1e3a9 scope link
10.244.0.203 dev cali30a5d23e521 scope link
10.244.103.0/26 via 129.254.175.94 dev tunl0 proto bird onlink
129.254.175.0/24 dev br-ex proto kernel scope link src 129.254.175.93
172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown
172.24.5.0/24 dev client-wg proto kernel scope link src 172.24.5.1

```

아래에서 처럼, route 경로를 지정해 줘야 해당 노드의 인터넷을 다시 사용할 수 있다. 

```shell
sudo ip route add default via 129.254.175.1 dev br-ex

# 변경 후, 
kcloud@kcloud-93:~$ route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         129.254.175.1   0.0.0.0         UG    0      0        0 br-ex
10.244.0.192    0.0.0.0         255.255.255.192 U     0      0        0 *
10.244.0.194    0.0.0.0         255.255.255.255 UH    0      0        0 cali4082d6067b4
10.244.0.200    0.0.0.0         255.255.255.255 UH    0      0        0 calia428d75e0c6
10.244.0.201    0.0.0.0         255.255.255.255 UH    0      0        0 calie4de4a1e3a9
10.244.0.203    0.0.0.0         255.255.255.255 UH    0      0        0 cali30a5d23e521
10.244.103.0    129.254.175.94  255.255.255.192 UG    0      0        0 tunl0
129.254.175.0   0.0.0.0         255.255.255.0   U     0      0        0 br-ex
172.17.0.0      0.0.0.0         255.255.0.0     U     0      0        0 docker0
172.24.5.0      0.0.0.0         255.255.255.0   U     0      0        0 client-wg

kcloud@kcloud-93:~$ ip route
default via 129.254.175.1 dev br-ex
blackhole 10.244.0.192/26 proto bird
10.244.0.194 dev cali4082d6067b4 scope link
10.244.0.200 dev calia428d75e0c6 scope link
10.244.0.201 dev calie4de4a1e3a9 scope link
10.244.0.203 dev cali30a5d23e521 scope link
10.244.103.0/26 via 129.254.175.94 dev tunl0 proto bird onlink
129.254.175.0/24 dev br-ex proto kernel scope link src 129.254.175.93
172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown
172.24.5.0/24 dev client-wg proto kernel scope link src 172.24.5.1

kcloud@kcloud-93:~$ ip r
default via 129.254.175.1 dev br-ex
blackhole 10.244.0.192/26 proto bird
10.244.0.194 dev cali4082d6067b4 scope link
10.244.0.200 dev calia428d75e0c6 scope link
10.244.0.201 dev calie4de4a1e3a9 scope link
10.244.0.203 dev cali30a5d23e521 scope link
10.244.103.0/26 via 129.254.175.94 dev tunl0 proto bird onlink
129.254.175.0/24 dev br-ex proto kernel scope link src 129.254.175.93
172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown
172.24.5.0/24 dev client-wg proto kernel scope link src 172.24.5.1

kcloud@kcloud-93:~$ ip link show
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
2: enp4s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel master ovs-system state UP mode DEFAULT group default qlen 1000
    link/ether 1c:69:7a:0a:6d:ee brd ff:ff:ff:ff:ff:ff
    altname enp0s31f6
3: wlp0s20f3: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN mode DORMANT group default qlen 1000
    link/ether 04:ea:56:48:1e:1c brd ff:ff:ff:ff:ff:ff
4: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN mode DEFAULT group default
    link/ether 46:4f:65:23:bc:11 brd ff:ff:ff:ff:ff:ff
5: kube-ipvs0: <BROADCAST,NOARP> mtu 1500 qdisc noop state DOWN mode DEFAULT group default
    link/ether fe:10:a3:5f:37:2f brd ff:ff:ff:ff:ff:ff
7: cali4082d6067b4@if2: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT group default qlen 1000
    link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff link-netns cni-b800f927-5acb-af4f-8f4e-3530881e01c7
9: tunl0@NONE: <NOARP,UP,LOWER_UP> mtu 1480 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/ipip 0.0.0.0 brd 0.0.0.0
14: client-wg: <POINTOPOINT,NOARP,UP,LOWER_UP> mtu 1420 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/none
19: calia428d75e0c6@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1480 qdisc noqueue state UP mode DEFAULT group default qlen 1000
    link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff link-netns cni-d5beccad-1508-f6ff-a667-2e2b56f1a043
20: calie4de4a1e3a9@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1480 qdisc noqueue state UP mode DEFAULT group default qlen 1000
    link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff link-netns cni-fe523173-2666-0f71-0360-f247fb83f98a
22: ovs-system: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 42:4d:5b:00:97:5c brd ff:ff:ff:ff:ff:ff
23: br-ex: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/ether 1c:69:7a:0a:6d:ee brd ff:ff:ff:ff:ff:ff
24: cali30a5d23e521@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1480 qdisc noqueue state UP mode DEFAULT group default qlen 1000
    link/ether ee:ee:ee:ee:ee:ee brd ff:ff:ff:ff:ff:ff link-netns cni-d66425a5-9093-cd0e-0ea2-e5bf01bb3206
25: br-int: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 4e:60:4e:78:8d:4d brd ff:ff:ff:ff:ff:ff
26: br-tun: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000
    link/ether 52:6f:c2:88:21:4a brd ff:ff:ff:ff:ff:ff
```

## openvswitch-xxx 의 connection refused

```shell
kcloud@kcloud-64:~/osh/openstack-helm/neutron$ kubectl get pod -n openstack openvswitch-ngd4p -o jsonpath='{.spec.containers[*].name}'
openvswitch-db openvswitch-vswitchdkcloud@kcloud-64:~/osh/openstack-helm/neutron$
kcloud@kcloud-64:~/osh/openstack-helm/neutron$ kubectl exec -n openstack -c openvswitch-vswitchd -it openvswitch-ngd4p -- bash
root@kcloud-93:/# ovs-vsctl show
ovs-vsctl: unix:/var/run/openvswitch/db.sock: database connection failed (Connection refused)
root@kcloud-93:/# kubectl logs -n openstack openvswitch-ngd4p -c openvswitch-db
bash: kubectl: command not found
root@kcloud-93:/#
root@kcloud-93:/#
root@kcloud-93:/# exit
exit
command terminated with exit code 127
kcloud@kcloud-64:~/osh/openstack-helm/neutron$ kubectl logs -n openstack openvswitch-ngd4p -c openvswitch-db
+ COMMAND=start
+ OVS_DB=/run/openvswitch/conf.db
+ OVS_SCHEMA=/usr/share/openvswitch/vswitch.ovsschema
+ OVS_PID=/run/openvswitch/ovsdb-server.pid
+ OVS_SOCKET=/run/openvswitch/db.sock
+ start
++ dirname /run/openvswitch/conf.db
+ mkdir -p /run/openvswitch
+ [[ ! -e /run/openvswitch/conf.db ]]
++ ovsdb-tool needs-conversion /run/openvswitch/conf.db /usr/share/openvswitch/vswitch.ovsschema
ovsdb-tool: I/O error: /run/openvswitch/conf.db: open failed (Permission denied)
+ [[ '' == \y\e\s ]]
+ umask 000
+ exec /usr/sbin/ovsdb-server /run/openvswitch/conf.db -vconsole:emer -vconsole:err -vconsole:info --pidfile=/run/openvswitch/ovsdb-server.pid --remote=punix:/run/openvswitch/db.sock --remote=db:Open_vSwitch,Open_vSwitch,manager_options --private-key=db:Open_vSwitch,SSL,private_key --certificate=db:Open_vSwitch,SSL,certificate --bootstrap-ca-cert=db:Open_vSwitch,SSL,ca_cert
ovsdb-server: /run/openvswitch/ovsdb-server.pid.tmp: create failed (Permission denied)
kcloud@kcloud-64:~/osh/openstack-helm/neutron$

```  


## neturon 

```shell
kcloud@kcloud-64:~/osh/openstack-helm$ kubectl logs -n openstack neutron-ovs-agent-default-c44bw -c neutron-ovs-agent-init
+ OVS_SOCKET=/run/openvswitch/db.sock
+ chown neutron: /run/openvswitch/db.sock
++ cat /run/openvswitch/ovs-vswitchd.pid
+ OVS_PID=47
+ OVS_CTL=/run/openvswitch/ovs-vswitchd.47.ctl
+ chown neutron: /run/openvswitch/ovs-vswitchd.47.ctl
+ DPDK_CONFIG_FILE=/tmp/dpdk.conf
+ DPDK_CONFIG=
+ DPDK_ENABLED=false
+ '[' -f /tmp/dpdk.conf ']'
++ sed 's/[{}"]//g' /tmp/auto_bridge_add
++ tr , '\n'
+ for bmap in `sed 's/[{}"]//g' /tmp/auto_bridge_add | tr "," "\n"`
+ bridge=br-ex
+ iface=enp87s0
+ [[ false == \t\r\u\e ]]
+ ovs-vsctl --db=unix:/run/openvswitch/db.sock --may-exist add-br br-ex
+ '[' -n enp87s0 ']'
+ '[' enp87s0 '!=' null ']'
+ ip link show enp87s0
+ ovs-vsctl --db=unix:/run/openvswitch/db.sock --may-exist add-port br-ex enp87s0
+ migrate_ip_from_nic enp87s0 br-ex
+ src_nic=enp87s0
+ bridge_name=br-ex
+ set +e
++ get_ip_address_from_interface enp87s0
++ local interface=enp87s0
+++ ip -4 -o addr s enp87s0
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $1}'
++ local ip=
++ '[' -z '' ']'
++ exit 1
+ ip=
++ get_ip_prefix_from_interface enp87s0
++ local interface=enp87s0
+++ ip -4 -o addr s enp87s0
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $2}'
++ local prefix=
++ '[' -z '' ']'
++ exit 1
+ prefix=
++ get_ip_address_from_interface br-ex
++ local interface=br-ex
+++ ip -4 -o addr s br-ex
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $1}'
++ local ip=129.254.175.94
++ '[' -z 129.254.175.94 ']'
++ echo 129.254.175.94
+ bridge_ip=129.254.175.94
++ get_ip_prefix_from_interface br-ex
++ local interface=br-ex
+++ ip -4 -o addr s br-ex
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $2}'
++ local prefix=24
++ '[' -z 24 ']'
++ echo 24
+ bridge_prefix=24
+ ip link set br-ex up
+ [[ -n '' ]]
+ [[ -n 129.254.175.94 ]]
+ [[ -n 24 ]]
+ echo 'Bridge '\''br-ex'\'' already has IP assigned. Keeping the same:: IP:[129.254.175.94]; Prefix:[24]...'
+ set -e
Bridge 'br-ex' already has IP assigned. Keeping the same:: IP:[129.254.175.94]; Prefix:[24]...
+ [[ false != \t\r\u\e ]]
+ ip link set dev enp87s0 up
+ tunnel_types=vxlan
+ [[ -n vxlan ]]
+ tunnel_interface=
+ '[' -z '' ']'
+ tunnel_network_cidr=0/0
+ '[' -z 0/0 ']'
++ ip -4 route list 0/0
++ awk -F dev '{ print $2; exit }'
++ awk '{ print $1 }'
+ tunnel_interface=
+ [[ false == \t\r\u\e ]]
+ [[ -n vxlan ]]
++ get_ip_address_from_interface
++ local interface=
+++ ip -4 -o addr s ''
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $1}'
Device "" does not exist.
++ local ip=
++ '[' -z '' ']'
++ exit 1
+ LOCAL_IP=

```  

해당 스크립트는 `_neutron-openvswitch-agent-init.sh.tpl`
- enp87s0 (외부 NIC)의 IP를 가져와서
- br-ex 라는 OVS 브리지에 추가하고
- 해당 IP를 enp87s0에서 제거하고 br-ex에 재할당하려고 시도합니다.
  - 이 때 br-ex에 이미 IP가 있었으면, IP 이동은 건너뜁니다.
- 이후 VXLAN용 tunnel 네트워크 설정을 위해 tunnel 인터페이스의 IP를 찾으려 합니다.  

Tunnel 장치 찾는 부분
- Helm chart 값에서 network.interface.tunnel이 명시되었는지 확인하고, 없다면:
- 기본값은 "0/0"
  - 이는 IPv4의 기본 라우팅 대상을 의미 (즉, 모든 주소 의미, 이 경로는 디폴트 게이트웨이를 통해 나가는 트래픽 경로 가리킴)

```shell
tunnel_types="{{- .Values.conf.plugins.openvswitch_agent.agent.tunnel_types -}}"
if [[ -n "${tunnel_types}" ]] ; then
    tunnel_interface="{{- .Values.network.interface.tunnel -}}"
    if [ -z "${tunnel_interface}" ] ; then
        # search for interface with tunnel network routing
        tunnel_network_cidr="{{- .Values.network.interface.tunnel_network_cidr -}}"
        if [ -z "${tunnel_network_cidr}" ] ; then
            tunnel_network_cidr="0/0"
        fi
        # If there is not tunnel network gateway, exit
        tunnel_interface=$(ip -4 route list ${tunnel_network_cidr} | awk -F 'dev' '{ print $2; exit }' \
            | awk '{ print $1 }') || exit 1
    fi
fi


``` 

## tuennle을 "" 할 경우, vm 생성에서 Error 발생함

```shell
kcloud@kcloud-64:~/osh$ kubectl exec -it -n openstack neutron-ovs-agent-default-j7ctg -c neutron-ovs-agent -- \
  ovs-vsctl show
5a259efa-ab21-4ba1-91ad-417f47591f3e
    Manager "ptcp:6640:127.0.0.1"
        is_connected: true
    Bridge br-int
        Controller "tcp:127.0.0.1:6633"
            is_connected: true
        fail_mode: secure
        datapath_type: system
        Port int-br-ex
            Interface int-br-ex
                type: patch
                options: {peer=phy-br-ex}
        Port br-int
            Interface br-int
                type: internal
        Port qg-93587833-e9
            tag: 1
            Interface qg-93587833-e9
                type: internal
        Port qr-5edd4b18-70
            tag: 4095
            trunks: [4095]
            Interface qr-5edd4b18-70
                type: internal
    Bridge br-ex
        Controller "tcp:127.0.0.1:6633"
            is_connected: true
        fail_mode: secure
        datapath_type: system
        Port enp87s0
            Interface enp87s0
        Port phy-br-ex
            Interface phy-br-ex
                type: patch
                options: {peer=int-br-ex}
        Port br-ex
            Interface br-ex
                type: internal

```  

```shell
kcloud@kcloud-64:~$ kubectl exec -it -n openstack neutron-ovs-agent-default-rj5vp -- bash
Defaulted container "neutron-ovs-agent" out of: neutron-ovs-agent, init (init), neutron-openvswitch-agent-kernel-modules (init), neutron-ovs-agent-init (init)
neutron@kcloud-94:/$
neutron@kcloud-94:/$ ovs-vsctl list Open_vSwitch
_uuid               : 5a259efa-ab21-4ba1-91ad-417f47591f3e
bridges             : [5159fa9b-9e0b-4796-9f6c-fafacff5849b, 7e7708be-ed54-4d4a-a75d-38f2b9b28ec5, ed0cc20e-d67d-4cc3-89a2-b6b3c07ec7d1]
cur_cfg             : 32
datapath_types      : [netdev, system]
datapaths           : {}
db_version          : []
dpdk_initialized    : false
dpdk_version        : none
external_ids        : {}
iface_types         : [erspan, geneve, gre, internal, ip6erspan, ip6gre, lisp, patch, stt, system, tap, vxlan]
manager_options     : [60a2e832-b079-4dc2-a16b-c9f654f41d3e]
next_cfg            : 32
other_config        : {}
ovs_version         : []
ssl                 : []
statistics          : {}
system_type         : []
system_version      : []
neutron@kcloud-94:/$ ovs-vsctl list Open_vSwitch |grep local_ip
neutron@kcloud-94:/$ cat /etc/neutron/plugins/ml2/openvswitch_agent.ini
[agent]
arp_responder = true
l2_population = true
tunnel_types = vxlan
[ovs]
bridge_mappings = public:br-ex
[securitygroup]
firewall_driver = neutron.agent.linux.iptables_firewall.OVSHybridIptablesFirewallDriver

```  


## Neutron Error

```shell
kcloud@kcloud-64:~/osh$ kubectl get pod -n openstack |grep neutron
neutron-db-init-jf62b                                  0/1     Completed               0              6m
neutron-db-sync-fbv4l                                  0/1     Completed               0              5m53s
neutron-dhcp-agent-default-529tm                       0/1     Init:0/2                0              6m
neutron-dhcp-agent-default-md4jl                       0/1     Init:0/2                0              6m
neutron-ks-endpoints-65sjb                             0/3     Completed               0              3m4s
neutron-ks-service-spjb9                               0/1     Completed               0              3m21s
neutron-ks-user-crvgs                                  0/1     Completed               0              2m49s
neutron-l3-agent-default-4cc7s                         0/1     Init:0/2                0              6m
neutron-l3-agent-default-dq28c                         0/1     Init:0/2                0              6m
neutron-metadata-agent-default-f2cdf                   0/1     Init:0/2                0              6m
neutron-metadata-agent-default-plbvg                   0/1     Init:0/2                0              6m
neutron-netns-cleanup-cron-default-crl49               1/1     Running                 0              6m
neutron-netns-cleanup-cron-default-vpgwz               1/1     Running                 0              6m
neutron-ovs-agent-default-24nf6                        0/1     Init:CrashLoopBackOff   4 (43s ago)    6m
neutron-rabbit-init-vxqft                              0/1     Completed               0              3m29s
neutron-rpc-server-6977c5bb44-wftpt                    1/1     Running                 0              6m
neutron-server-74848d79b6-db4hl                        1/1     Running                 0              6m

kcloud@kcloud-64:~/osh$ kubectl logs -n openstack neutron-ovs-agent-default-24nf6
Defaulted container "neutron-ovs-agent" out of: neutron-ovs-agent, init (init), neutron-openvswitch-agent-kernel-modules (init), neutron-ovs-agent-init (init)
Error from server (BadRequest): container "neutron-ovs-agent" in pod "neutron-ovs-agent-default-24nf6" is waiting to start: PodInitializing
kcloud@kcloud-64:~/osh$ kubectl logs -n openstack neutron-ovs-agent-default-24nf6 -c neutron-ovs-agent-init
+ OVS_SOCKET=/run/openvswitch/db.sock
+ chown neutron: /run/openvswitch/db.sock
++ cat /run/openvswitch/ovs-vswitchd.pid
+ OVS_PID=48
+ OVS_CTL=/run/openvswitch/ovs-vswitchd.48.ctl
+ chown neutron: /run/openvswitch/ovs-vswitchd.48.ctl
+ DPDK_CONFIG_FILE=/tmp/dpdk.conf
+ DPDK_CONFIG=
+ DPDK_ENABLED=false
+ '[' -f /tmp/dpdk.conf ']'
++ sed 's/[{}"]//g' /tmp/auto_bridge_add
++ tr , '\n'
+ for bmap in `sed 's/[{}"]//g' /tmp/auto_bridge_add | tr "," "\n"`
+ bridge=br-ex
+ iface=enp87s0
+ [[ false == \t\r\u\e ]]
+ ovs-vsctl --db=unix:/run/openvswitch/db.sock --may-exist add-br br-ex
+ '[' -n enp87s0 ']'
+ '[' enp87s0 '!=' null ']'
+ ip link show enp87s0
+ ovs-vsctl --db=unix:/run/openvswitch/db.sock --may-exist add-port br-ex enp87s0
+ migrate_ip_from_nic enp87s0 br-ex
+ src_nic=enp87s0
+ bridge_name=br-ex
+ set +e
++ get_ip_address_from_interface enp87s0
++ local interface=enp87s0
+++ ip -4 -o addr s enp87s0
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $1}'
++ local ip=
++ '[' -z '' ']'
++ exit 1
+ ip=
++ get_ip_prefix_from_interface enp87s0
++ local interface=enp87s0
+++ ip -4 -o addr s enp87s0
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $2}'
++ local prefix=
++ '[' -z '' ']'
++ exit 1
+ prefix=
++ get_ip_address_from_interface br-ex
++ local interface=br-ex
+++ ip -4 -o addr s br-ex
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $1}'
++ local ip=129.254.175.94
++ '[' -z 129.254.175.94 ']'
++ echo 129.254.175.94
+ bridge_ip=129.254.175.94
++ get_ip_prefix_from_interface br-ex
++ local interface=br-ex
+++ ip -4 -o addr s br-ex
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $2}'
++ local prefix=24
++ '[' -z 24 ']'
++ echo 24
+ bridge_prefix=24
+ ip link set br-ex up
+ [[ -n '' ]]
+ [[ -n 129.254.175.94 ]]
+ [[ -n 24 ]]
+ echo 'Bridge '\''br-ex'\'' already has IP assigned. Keeping the same:: IP:[129.254.175.94]; Prefix:[24]...'
+ set -e
Bridge 'br-ex' already has IP assigned. Keeping the same:: IP:[129.254.175.94]; Prefix:[24]...
+ [[ false != \t\r\u\e ]]
+ ip link set dev enp87s0 up
+ tunnel_types=vxlan
+ [[ -n vxlan ]]
+ tunnel_interface=
+ '[' -z '' ']'
+ tunnel_network_cidr=0/0
+ '[' -z 0/0 ']'
++ ip -4 route list 0/0
++ awk -F dev '{ print $2; exit }'
++ awk '{ print $1 }'
+ tunnel_interface=
+ [[ false == \t\r\u\e ]]
+ [[ -n vxlan ]]
++ get_ip_address_from_interface
++ local interface=
+++ ip -4 -o addr s ''
+++ awk '{ print $4; exit }'
+++ awk -F / 'NR==1 {print $1}'
Device "" does not exist.
++ local ip=
++ '[' -z '' ']'
++ exit 1
+ LOCAL_IP=

```  

위의 Device "" does not exist 가 Error의 원인
enp87s0 의 ip를 br-ex에 할당 후 tunnel network cidr을 0/0으로 설정 후에,
ip -4 route list 0/0 에서 오류가 발생함
이는 기존 default route 정보가 enp87s0에서 사라져서(ip를 br-ex에 할당해서) route 정보가 나오지 않기 때문
해당 로그는 _neutron-openvswitch-agent-init.sh.tpl 실행 기준  


## VM 생성 시, Error 확인

```shell
openstack server show {instance 이름}
openstack server event list {instance id}
openstack server event show  {instance id} {request id}

(openstack-client) root@kcloud-93:~/openstack-img# openstack server show test-gpu
+-------------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------+
| Field                               | Value                                                                                                                                                 |
+-------------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------+
| OS-DCF:diskConfig                   | MANUAL                                                                                                                                                |
| OS-EXT-AZ:availability_zone         |                                                                                                                                                       |
| OS-EXT-SRV-ATTR:host                | None                                                                                                                                                  |
| OS-EXT-SRV-ATTR:hostname            | test-gpu                                                                                                                                              |
| OS-EXT-SRV-ATTR:hypervisor_hostname | None                                                                                                                                                  |
| OS-EXT-SRV-ATTR:instance_name       | instance-00000001                                                                                                                                     |
| OS-EXT-SRV-ATTR:kernel_id           |                                                                                                                                                       |
| OS-EXT-SRV-ATTR:launch_index        | 0                                                                                                                                                     |
| OS-EXT-SRV-ATTR:ramdisk_id          |                                                                                                                                                       |
| OS-EXT-SRV-ATTR:reservation_id      | r-eo7vzac0                                                                                                                                            |
| OS-EXT-SRV-ATTR:root_device_name    | None                                                                                                                                                  |
| OS-EXT-SRV-ATTR:user_data           | I2Nsb3VkLWNvbmZpZwp1c2VyczoKICAtIG5hbWU6IHVidW50dQogICAgZ3JvdXBzOiBzdWRvCiAgICBzaGVsbDogL2Jpbi9iYXNoCiAgICBzdWRvOiBBTEw9KEFMTCkgTk9QQVNTV0Q6QUxMCiAgI |
|                                     | CBsb2NrX3Bhc3N3ZDogZmFsc2UKc3NoX3B3YXV0aDogdHJ1ZQpjaHBhc3N3ZDoKICBsaXN0OiB8CiAgICB1YnVudHU6dWJ1bnR1CiAgZXhwaXJlOiBmYWxzZQo=                           |
| OS-EXT-STS:power_state              | NOSTATE                                                                                                                                               |
| OS-EXT-STS:task_state               | None                                                                                                                                                  |
| OS-EXT-STS:vm_state                 | error                                                                                                                                                 |
| OS-SRV-USG:launched_at              | None                                                                                                                                                  |
| OS-SRV-USG:terminated_at            | None                                                                                                                                                  |
| accessIPv4                          |                                                                                                                                                       |
| accessIPv6                          |                                                                                                                                                       |
| addresses                           |                                                                                                                                                       |
| config_drive                        |                                                                                                                                                       |
| created                             | 2025-07-07T08:56:12Z                                                                                                                                  |
| description                         | None                                                                                                                                                  |
| flavor                              | description=, disk='20', ephemeral='0', extra_specs.pci_passthrough:alias='a30:1', id='a30.small', is_disabled=, is_public='True', location=,         |
|                                     | name='a30.small', original_name='a30.small', ram='2048', rxtx_factor=, swap='0', vcpus='2'                                                            |
| hostId                              |                                                                                                                                                       |
| host_status                         |                                                                                                                                                       |
| id                                  | b85adcfe-3feb-400b-b60a-2d9231636672                                                                                                                  |
| image                               | ubuntu22.04 (4f802b42-8cfa-424e-88fd-c11112fb456c)                                                                                                    |
| key_name                            | mykey                                                                                                                                                 |
| locked                              | False                                                                                                                                                 |
| locked_reason                       | None                                                                                                                                                  |
| name                                | test-gpu                                                                                                                                              |
| pinned_availability_zone            | None                                                                                                                                                  |
| progress                            | None                                                                                                                                                  |
| project_id                          | 8c1e6d6e50ff40ba9889cfa641f73210                                                                                                                      |
| properties                          |                                                                                                                                                       |
| scheduler_hints                     |                                                                                                                                                       |
| server_groups                       | None                                                                                                                                                  |
| status                              | ERROR                                                                                                                                                 |
| tags                                |                                                                                                                                                       |
| trusted_image_certificates          | None                                                                                                                                                  |
| updated                             | 2025-07-07T08:56:13Z                                                                                                                                  |
| user_id                             | a21b1172e2154dc890ca89fcdc9d307b                                                                                                                      |
| volumes_attached                    |                                                                                                                                                       |
+-------------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------+
(openstack-client) root@kcloud-93:~/openstack-img# openstack server event list b85adcfe-3feb-400b-b60a-2d9231636672
+------------------------------------------+--------------------------------------+--------+----------------------------+
| Request ID                               | Server ID                            | Action | Start Time                 |
+------------------------------------------+--------------------------------------+--------+----------------------------+
| req-10da21bf-4656-4347-b1da-c00d72feeae1 | b85adcfe-3feb-400b-b60a-2d9231636672 | create | 2025-07-07T08:56:11.000000 |
+------------------------------------------+--------------------------------------+--------+----------------------------+
(openstack-client) root@kcloud-93:~/openstack-img# openstack server event show  b85adcfe-3feb-400b-b60a-2d9231636672  req-10da21bf-4656-4347-b1da-c00d72feeae1
+------------+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Field      | Value                                                                                                                                                                          |
+------------+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| action     | create                                                                                                                                                                         |
| events     | details='Host 'kcloud-242' is not mapped to any cell', event='conductor_schedule_and_build_instances', finish_time='2025-07-07T08:56:13.000000', host='nova-                   |
|            | conductor-86b5c96d54-kcxgq', host_id='d7f59733d34450bf6b9cc493f17ec3950b5406c4abd9947e8938160f', result='Error', start_time='2025-07-07T08:56:13.000000', traceback='  File    |
|            | "/var/lib/openstack/lib/python3.12/site-packages/nova/conductor/manager.py", line 1678, in schedule_and_build_instances                                                        |
|            |     host_mapping = objects.HostMapping.get_by_host(                                                                                                                            |
|            |                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^                                                                                                                            |
|            |   File "/var/lib/openstack/lib/python3.12/site-packages/oslo_versionedobjects/base.py", line 184, in wrapper                                                                   |
|            |     result = fn(cls, context, *args, **kwargs)                                                                                                                                 |
|            |              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^                                                                                                                                 |
|            |   File "/var/lib/openstack/lib/python3.12/site-packages/nova/objects/host_mapping.py", line 106, in get_by_host                                                                |
|            |     db_mapping = cls._get_by_host_from_db(context, host)                                                                                                                       |
|            |                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^                                                                                                                       |
|            |   File "/var/lib/openstack/lib/python3.12/site-packages/oslo_db/sqlalchemy/enginefacade.py", line 1183, in wrapper                                                             |
|            |     return fn(*args, **kwargs)                                                                                                                                                 |
|            |            ^^^^^^^^^^^^^^^^^^^                                                                                                                                                 |
|            |   File "/var/lib/openstack/lib/python3.12/site-packages/nova/objects/host_mapping.py", line 101, in _get_by_host_from_db                                                       |
|            |     raise exception.HostMappingNotFound(name=host)                                                                                                                             |
|            | '                                                                                                                                                                              |
| id         | req-10da21bf-4656-4347-b1da-c00d72feeae1                                                                                                                                       |
| message    | Error                                                                                                                                                                          |
| project_id | 8c1e6d6e50ff40ba9889cfa641f73210                                                                                                                                               |
| request_id | req-10da21bf-4656-4347-b1da-c00d72feeae1                                                                                                                                       |
| start_time | 2025-07-07T08:56:11.000000                                                                                                                                                     |
| user_id    | a21b1172e2154dc890ca89fcdc9d307b                                                                                                                                               |
+------------+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+


kcloud@kcloud-64:~/osh$ kubectl exec -it -n openstack nova-api-osapi-9fbd689f5-v68nq -- /bin/bash
Defaulted container "nova-osapi" out of: nova-osapi, init (init)

nova@nova-api-osapi-9fbd689f5-v68nq:/$ nova-manage cell_v2 list_cells
+-------+--------------------------------------+---------------------------------------------------------------------------------------+-------------------------------------------------------------------------------+----------+
|  Name |                 UUID                 |                                     Transport URL                                     |                              Database Connection                              | Disabled |
+-------+--------------------------------------+---------------------------------------------------------------------------------------+-------------------------------------------------------------------------------+----------+
| cell0 | 00000000-0000-0000-0000-000000000000 |                                         none:/                                        | mysql+pymysql://nova:****@mariadb.openstack.svc.cluster.local:3306/nova_cell0 |  False   |
| cell1 | 2faebc38-3f15-4210-820f-9bc75d47c53d | rabbit://nova:****@rabbitmq-rabbitmq-1.rabbitmq.openstack.svc.cluster.local:5672/nova |    mysql+pymysql://nova:****@mariadb.openstack.svc.cluster.local:3306/nova    |  False   |
+-------+--------------------------------------+---------------------------------------------------------------------------------------+-------------------------------------------------------------------------------+----------+

nova@nova-api-osapi-9fbd689f5-v68nq:/$ nova-manage cell_v2 list_hosts
+-----------+--------------------------------------+------------+
| Cell Name |              Cell UUID               |  Hostname  |
+-----------+--------------------------------------+------------+
|   cell1   | 2faebc38-3f15-4210-820f-9bc75d47c53d | kcloud-241 |
|   cell1   | 2faebc38-3f15-4210-820f-9bc75d47c53d | kcloud-242 |
+-----------+--------------------------------------+------------+

```  

## VM 생성 시, More than one SecurityGroup exists with the name 'default'

Openstack은 프로젝트 별로 보안 그룹이 존재함  
같은 프로젝트 안에 이름이 같은 보안 그룹이 여러 개 있으면 이름만으로 지정할 경우 충돌

- 보안 그룹 ID 확인

```shell
openstack project list
openstack security group list --project 3cc2b3ae927341bea2f6ffee565621ef
openstack server create test-vm \
  --image ubuntu22.04 \
  --flavor m1.small.test \
  --network private-net \
  --key-name mykey \
  --user-data ubuntu-user-data.yaml \
  --security-group 8bb30cd5-0e09-474f-a85d-3e77a5dcb2f2


##-- 실행 예 >
(openstack-client) kcloud@kcloud-93:~/openstack-img$ openstack project list
+----------------------------------+-----------------+
| ID                               | Name            |
+----------------------------------+-----------------+
| 32d680c5deb84dbc9538ddb67729e145 | internal_cinder |
| 3cc2b3ae927341bea2f6ffee565621ef | demo            |
| 8c1e6d6e50ff40ba9889cfa641f73210 | admin           |
| 93f55cf8146c4230a8f316e33d0401fa | service         |
+----------------------------------+-----------------+
(openstack-client) kcloud@kcloud-93:~/openstack-img$ openstack security group list --project 3cc2b3ae927341bea2f6ffee565621ef
+--------------------------------------+---------+------------------------+----------------------------------+------+
| ID                                   | Name    | Description            | Project                          | Tags |
+--------------------------------------+---------+------------------------+----------------------------------+------+
| 8bb30cd5-0e09-474f-a85d-3e77a5dcb2f2 | default | Default security group | 3cc2b3ae927341bea2f6ffee565621ef | []   |
+--------------------------------------+---------+------------------------+----------------------------------+------+
(openstack-client) kcloud@kcloud-93:~/openstack-img$ openstack server create test-vm   --image ubuntu22.04   --flavor m1.small.test   --network private-net   --key-name mykey   --user-data ubuntu-user-data.yaml   --security-group 8bb30cd5-0e09-474f-a85d-3e77a5dcb2f2


```  

## Horizon Concole 에 접근 불가능한 이유

📕 master node가 compute-node=enabled, openvswitch=enabled 일 경우, 문제 없이 접근 가능함

📕 아래 내용은 아니고, master node에 실행되는 horizon pod가 compute-node에 있는 VM에 접근하는 네트워크가 구성되어 있지 않은 것으로 보임, br-ex와 birdge 설정이 openvswitch로 되어 있지 않아, 192.168 대역에 대한 통신이 되지 않는 듯.. 
- 이게 맞다면, openvswitch와 compute 노드를 all node로 enable 시켜주어야 한다. 

nova-novavncproxy 포드의 Log를 보면, nova-compute가 실행되는 129.254.202.242:5901 로 연결을 시도함
- ovncproxy → nova-compute 노드의 129.254.202.242 IP:5900 로 QEMU VNC에 접속하라고 지시받았다는 뜻
- novncproxy는 horizon에서 websocket 요청을 받고 → 토큰을 검증하고 → nova-compute가 DB에 기록한 VNC listen 주소(IP:포트) 를 읽어서 저기로 프록시를 띄워 줌
- 그런데 horizon 사용자는 브라우저에서 `http://novncproxy.openstack.svc.cluster.local/vnc_auto.html?token=..`에 접속할 뿐이지, 저 129.254.202.242:5900 으로 직접 갈 수는 없음  
- 

```shell
kcloud@kcloud-64:~$ kubectl -n openstack logs nova-novncproxy-58fc48b555-zxs7x | tail -5
Defaulted container "nova-novncproxy" out of: nova-novncproxy, init (init), nova-novncproxy-init (init), nova-novncproxy-init-assets (init)
2025-07-09 03:01:12.481 5163 INFO nova.console.websocketproxy [-] 10.244.42.2 - - [09/Jul/2025 03:01:12] 10.244.42.2: Path: '/?token=06df2afd-b102-49be-93a6-04307cd9be2d'
2025-07-09 03:01:12.675 5163 INFO nova.compute.rpcapi [None req-098d239c-ab17-4942-9f70-10b35f40587f - - - - - -] Automatically selected compute RPC version 6.4 from minimum service version 68
2025-07-09 03:01:13.223 5163 INFO nova.console.websocketproxy [None req-098d239c-ab17-4942-9f70-10b35f40587f - - - - - -]  5086: connect info: ConsoleAuthToken(access_url_base='http://novncproxy.openstack.svc.cluster.local/vnc_auto.html',console_type='novnc',created_at=2025-07-09T03:01:11Z,expires=1752030671,host='129.254.202.242',id=8,instance_uuid=3ce0fc50-51e5-48aa-b4f6-7def154f9bb4,internal_access_path=None,port=5901,tls_port=None,token='***',updated_at=None)
2025-07-09 03:01:13.224 5163 INFO nova.console.websocketproxy [None req-098d239c-ab17-4942-9f70-10b35f40587f - - - - - -]  5086: connecting to: 129.254.202.242:5901
<}<}2025-07-09 03:01:13.232 5163 INFO nova.console.securityproxy.rfb [None req-098d239c-ab17-4942-9f70-10b35f40587f - - - - - -] Finished security handshake, resuming normal proxy mode using secured socket

```  

nova-compute 의 nova.conf 의 vncserver_proxyclient_address 를 127.0.0.1 로 고쳐야 함
✅ 문제는 뭐야?

OpenStack Horizon에서 VM 콘솔 열면
→ nova-compute가 알려준 접속 IP로 novncproxy가 붙어야 해.

그런데 지금 nova-compute가 노드의 외부 IP를 DB에 저장해버림.

novncproxy가 그 외부 IP로 붙으려다 실패!

✅ 왜 그런 거야?

nova-compute는 자기가 VM을 실행한 곳의 IP를 nova DB에 기록해.

그런데 컨테이너 환경에서는 그 IP가 novncproxy가 직접 붙을 수 없는 IP일 수 있어.

사실 novncproxy랑 nova-compute는 같은 노드/네트워크 안에서 localhost로 통신하면 돼.

✅ 해결책은?

nova-compute가 DB에 내 IP 대신 127.0.0.1을 기록하도록 하면 됨.

그러면 novncproxy는 DB에서 주소를 읽고 localhost로 접속 → 잘 붙음!

```shell

cd ~/osh
tee ${OVERRIDES_DIR}/nova/nova_vnc_fix.yaml <<EOF
conf:
  nova:
    vnc:
      server_proxyclient_address: 127.0.0.1
EOF

kubectl delete job -n openstack nova-bootstrap
kubectl delete job -n openstack nova-cell-setup

helm upgrade --install nova openstack-helm/nova \
  --namespace=openstack \
  $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c nova ${FEATURES})
```  


## helm chart 실행 시, helm-toolkit Error
```shell
# Error
Error: An error occurred while checking for chart dependencies. You may need to run `helm dependency build` to fetch missing dependencies: found in Chart.yaml, but missing in charts/ directory: helm-toolkit

# rabbitmq를 설치하는데 필요한 helm-toolkit을 찾을 수 없어서 발생하는 Error
# ~/osh/openstack-helm/rabbitmq 로 이동 후, helm dependency build 수행
cd ~/osh/openstack-helm/rabbitmq
helm dependency build

# 이를 수행하면, ~/osh/openstack-helm/rabbitmq/charts 에 helm-toolkit 파일이 생성된다.
tree ~/osh/openstack-helm/rabbitmq/charts

/home/kcloud/osh/openstack-helm/rabbitmq/charts
└── helm-toolkit-2025.1.0.tgz

0 directories, 1 file
```  

## Neutorn Carsh off

📕 93번 노드가 compute-node=disabled, openvswitch=enabled 로 라벨링 되어 있어서 그런 것인지 의심됨


```shell
kcloud@kcloud-64:~$ kubectl get pod -n openstack -o wide|grep 129.254.175.93
neutron-dhcp-agent-default-shjm4                       0/1     Running            104 (3m40s ago)   16h    129.254.175.93    kcloud-93    <none>           <none>
neutron-l3-agent-default-v2b8f                         0/1     Running            11 (7m50s ago)    67m    129.254.175.93    kcloud-93    <none>           <none>
neutron-metadata-agent-default-mqkzd                   0/1     Running            33 (27m ago)      16h    129.254.175.93    kcloud-93    <none>           <none>
neutron-netns-cleanup-cron-default-btd9f               1/1     Running            0                 16h    129.254.175.93    kcloud-93    <none>           <none>
neutron-ovs-agent-default-pmgdr                        0/1     CrashLoopBackOff   128 (4m2s ago)    16h    129.254.175.93    kcloud-93    <none>           <none>
openvswitch-zhr4n                                      2/2     Running            0                 17h    129.254.175.93    kcloud-93    <none>           <none>
kcloud@kcloud-64:~$ kubectl logs -n openstack neutron-ovs-agent-default-pmgdr
Defaulted container "neutron-ovs-agent" out of: neutron-ovs-agent, init (init), neutron-openvswitch-agent-kernel-modules (init), neutron-ovs-agent-init (init)
+ exec neutron-openvswitch-agent --config-file /etc/neutron/neutron.conf --config-file /tmp/pod-shared/neutron-agent.ini --config-file /tmp/pod-shared/ml2-local-ip.ini --config-file /etc/neutron/plugins/ml2/openvswitch_agent.ini --config-file /etc/neutron/plugins/ml2/ml2_conf.ini
This program is using eventlet and has been monkey_patched
/var/lib/openstack/lib/python3.12/site-packages/pecan/core.py:320: SyntaxWarning: invalid escape sequence '\*'
  '''
/var/lib/openstack/lib/python3.12/site-packages/pecan/routing.py:48: SyntaxWarning: invalid escape sequence '\('
  '^[0-9a-zA-Z-_$\(\)\.~!,;:*+@=]+$', route
2025-07-10 02:23:00.442 32998 INFO neutron.common.config [-] Logging enabled!
2025-07-10 02:23:00.442 32998 INFO neutron.common.config [-] /var/lib/openstack/bin/neutron-openvswitch-agent version 26.0.2.dev23
2025-07-10 02:23:01.522 32998 INFO neutron.agent.agent_extensions_manager [-] Loaded agent extensions: []
2025-07-10 02:23:06.113 32998 INFO neutron.plugins.ml2.drivers.openvswitch.agent.openflow.native.ovs_bridge [-] Bridge br-int has datapath-ID 00009e154d699a4c
2025-07-10 02:23:06.118 32998 INFO neutron.plugins.ml2.drivers.openvswitch.agent.ovs_neutron_agent [-] Mapping physical network public to bridge br-ex
2025-07-10 02:23:06.119 32998 INFO neutron.plugins.ml2.drivers.openvswitch.agent.ovs_neutron_agent [-] Bridge br-ex datapath-id = 0x000048210b36bb40
2025-07-10 02:23:06.122 32998 INFO neutron.plugins.ml2.drivers.openvswitch.agent.openflow.native.ovs_bridge [-] Bridge br-ex has datapath-ID 000048210b36bb40
2025-07-10 02:23:06.128 32998 INFO neutron.plugins.ml2.drivers.openvswitch.agent.openflow.native.ovs_bridge [-] Bridge br-tun has datapath-ID 0000b2a4a553424b
2025-07-10 02:26:06.174 32998 ERROR neutron.plugins.ml2.drivers.openvswitch.agent.openflow.native.ovs_oskenapp [-] Agent main thread died of an exception: OSError: Server unexpectedly closed connection
2025-07-10 02:26:06.174 32998 ERROR neutron.plugins.ml2.drivers.openvswitch.agent.openflow.native.ovs_oskenapp Traceback (most recent call last):
2025-07-10 02:26:06.174 32998 ERROR neutron.plugins.ml2.drivers.openvswitch.agent.openflow.native.ovs_oskenapp   File "/var/lib/openstack/lib/python3.12/site-packages/amqp/connection.py", line 515, in channel
2025-07-10 02:26:06.174 32998 ERROR neutr

#(중략)

2025-07-10 02:26:06.179 32998 ERROR neutron     self._set_current_channel(self.connection.channel())
2025-07-10 02:26:06.179 32998 ERROR neutron                               ^^^^^^^^^^^^^^^^^^^^^^^^^
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/kombu/connection.py", line 303, in channel
2025-07-10 02:26:06.179 32998 ERROR neutron     chan = self.transport.create_channel(self.connection)
2025-07-10 02:26:06.179 32998 ERROR neutron            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/kombu/transport/pyamqp.py", line 168, in create_channel
2025-07-10 02:26:06.179 32998 ERROR neutron     return connection.channel()
2025-07-10 02:26:06.179 32998 ERROR neutron            ^^^^^^^^^^^^^^^^^^^^
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/amqp/connection.py", line 518, in channel
2025-07-10 02:26:06.179 32998 ERROR neutron     channel.open()
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/amqp/channel.py", line 448, in open
2025-07-10 02:26:06.179 32998 ERROR neutron     return self.send_method(
2025-07-10 02:26:06.179 32998 ERROR neutron            ^^^^^^^^^^^^^^^^^
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/amqp/abstract_channel.py", line 79, in send_method
2025-07-10 02:26:06.179 32998 ERROR neutron     return self.wait(wait, returns_tuple=returns_tuple)
2025-07-10 02:26:06.179 32998 ERROR neutron            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/amqp/abstract_channel.py", line 99, in wait
2025-07-10 02:26:06.179 32998 ERROR neutron     self.connection.drain_events(timeout=timeout)
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/amqp/connection.py", line 526, in drain_events
2025-07-10 02:26:06.179 32998 ERROR neutron     while not self.blocking_read(timeout):
2025-07-10 02:26:06.179 32998 ERROR neutron               ^^^^^^^^^^^^^^^^^^^^^^^^^^^
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/amqp/connection.py", line 531, in blocking_read
2025-07-10 02:26:06.179 32998 ERROR neutron     frame = self.transport.read_frame()
2025-07-10 02:26:06.179 32998 ERROR neutron             ^^^^^^^^^^^^^^^^^^^^^^^^^^^
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/amqp/transport.py", line 297, in read_frame
2025-07-10 02:26:06.179 32998 ERROR neutron     frame_header = read(7, True)
2025-07-10 02:26:06.179 32998 ERROR neutron                    ^^^^^^^^^^^^^
2025-07-10 02:26:06.179 32998 ERROR neutron   File "/var/lib/openstack/lib/python3.12/site-packages/amqp/transport.py", line 640, in _read
2025-07-10 02:26:06.179 32998 ERROR neutron     raise OSError('Server unexpectedly closed connection')
2025-07-10 02:26:06.179 32998 ERROR neutron OSError: Server unexpectedly closed connection
```

```shell
# neutron-openvswitch-agent가 RabbitMQ 서버와의 AMQP 연결을 맺으려다 서버 측에서 연결이 닫힘.
OSError: Server unexpectedly closed connection
```  


## Horizon Web 외부에서 연결
```shell
tee ${OVERRIDES_DIR}/horizon/host_fqdn_override.yaml <<EOF
endpoints:
  dashboard:
    host_fqdn_override:
      public:
        host: "horizon.129-254-202-253.sslip.io"

  compute_console:
    host_fqdn_override:
      public:
        host: "novncproxy.129-254-202-253.sslip.io"
EOF
```

웹 브라우저에서 `http://horizon.129-254-202-253.sslip.io` 로 접근


```shell
Browser
  ↓
http://horizon.129-254-202-253.sslip.io
  ↓
DNS → 129.254.202.253 (MetalLB IP)
  ↓
K8s LoadBalancer Service (public-openstack)
  ↓
Ingress Controller (nginx)
  ↓
Ingress Rule (host: horizon.129-254-202-253.sslip.io)
  ↓
horizon Service (ClusterIP)
  ↓
Horizon Pods
```


## Horizon Console 외부에서 연결

```shell
(openstack-client) kcloud@kcloud-241:~$ openstack console url show test-npu
+----------+------------------------------------------------------------------------------------------------------------------+
| Field    | Value                                                                                                            |
+----------+------------------------------------------------------------------------------------------------------------------+
| protocol | vnc                                                                                                              |
| type     | novnc                                                                                                            |
| url      | http://novncproxy.openstack.svc.cluster.local/vnc_auto.html?path=%3Ftoken%3Dde47f885-7de8-4d7d-9a2d-6e7e952462e2 |
+----------+------------------------------------------------------------------------------------------------------------------+
(openstack-client) kcloud@kcloud-241:~$ openstack service list
+----------------------------------+-----------+----------------+
| ID                               | Name      | Type           |
+----------------------------------+-----------+----------------+
| 1408984d8e4246459312697f40222491 | glance    | image          |
| 378a0d3dfa8d41de81ffd5a8847aa689 | heat      | orchestration  |
| 60e22d2b695d484e8328a8a2a6a94925 | cinderv3  | volumev3       |
| 68c82cf0fb84437c905ba6964f21e7d8 | nova      | compute        |
| 6e292aadb35e4a27ab11093303347b6e | heat-cfn  | cloudformation |
| a775459ebd37461a84c53f8b93fa5f96 | placement | placement      |
| bf39d44044df4a5a9229922f8badf446 | neutron   | network        |
| e48d2463b6014fe68bd2a4556313756e | keystone  | identity       |
+----------------------------------+-----------+----------------+
(openstack-client) kcloud@kcloud-241:~$ openstack service create --name novncproxy --description "NoVNC Proxy service" compute-console
+-------------+----------------------------------+
| Field       | Value                            |
+-------------+----------------------------------+
| id          | 7f6e64f760134e6fb7386a67db2b3092 |
| name        | novncproxy                       |
| type        | compute-console                  |
| enabled     | True                             |
| description | NoVNC Proxy service              |
+-------------+----------------------------------+
(openstack-client) kcloud@kcloud-241:~$ openstack service list | grep compute-console
| 7f6e64f760134e6fb7386a67db2b3092 | novncproxy | compute-console |
(openstack-client) kcloud@kcloud-241:~$ openstack endpoint create \
  --region RegionOne \
  compute-console public \
  http://novncproxy.129-254-202-253.sslip.io/vnc_auto.html
+--------------+----------------------------------------------------------+
| Field        | Value                                                    |
+--------------+----------------------------------------------------------+
| enabled      | True                                                     |
| id           | 1079df9e19b74cbba8d7eb21ad3e7ac2                         |
| interface    | public                                                   |
| region       | RegionOne                                                |
| region_id    | RegionOne                                                |
| service_id   | 7f6e64f760134e6fb7386a67db2b3092                         |
| url          | http://novncproxy.129-254-202-253.sslip.io/vnc_auto.html |
| service_name | novncproxy                                               |
| service_type | compute-console                                          |
+--------------+----------------------------------------------------------+
(openstack-client) kcloud@kcloud-241:~$ openstack endpoint list --service compute-console
+----------------------------------+-----------+--------------+-----------------+---------+-----------+----------------------------------------------------------+
| ID                               | Region    | Service Name | Service Type    | Enabled | Interface | URL                                                      |
+----------------------------------+-----------+--------------+-----------------+---------+-----------+----------------------------------------------------------+
| 1079df9e19b74cbba8d7eb21ad3e7ac2 | RegionOne | novncproxy   | compute-console | True    | public    | http://novncproxy.129-254-202-253.sslip.io/vnc_auto.html |
+----------------------------------+-----------+--------------+-----------------+---------+-----------+----------------------------------------------------------+
``` 

```shell
##-- 기존 설정 확인, novncproxy_base_url
kcloud@kcloud-64:~$ kubectl exec -n openstack nova-api-osapi-79db98d9f-7wlsq -- cat /etc/nova/nova.conf |grep vnc -A 5
Defaulted container "nova-osapi" out of: nova-osapi, init (init)
[vnc]
auth_schemes = none
enabled = true
novncproxy_base_url = http://novncproxy.openstack.svc.cluster.local/vnc_auto.html
novncproxy_host = 0.0.0.0
novncproxy_port = 6080
server_listen = 0.0.0.0
[wsgi]
api_paste_config = /etc/nova/api-paste.ini


kcloud@kcloud-64:~$ kubectl get pods -n openstack | grep nova-api-osapi
nova-api-metadata-8546fdc75-lgmfc                      1/1     Running     0             17h
nova-api-osapi-5d669bf8fc-5kb4r                        1/1     Running     0             17h

kcloud@kcloud-64:~$ kubectl delete pod -n openstack nova-api-osapi-5d669bf8fc-5kb4r
pod "nova-api-osapi-5d669bf8fc-5kb4r" deleted
```

```shell
tee ${OVERRIDES_DIR}/nova/nova_novncproxy.yaml <<EOF
endpoints:
  compute_console:
    host_fqdn_override:
      public:
        host: "novncproxy.129-254-202-253.sslip.io"

conf:
  nova:
    vnc:
      novncproxy_base_url: null
EOF

tee ${OVERRIDES_DIR}/nova/nova_endpoint_accel.yaml <<EOF
endpoints:
  compute_console:
    host_fqdn_override:
      public:
        host: "novncproxy.129-254-202-253.sslip.io"

conf:
  nova:
    vnc:
      novncproxy_base_url: null
    filter_scheduler:
      enabled_filters: >-
        ComputeFilter,ComputeCapabilitiesFilter,ImagePropertiesFilter,
        ServerGroupAntiAffinityFilter,ServerGroupAffinityFilter,
        PciPassthroughFilter
    pci:
      alias:
        - '{ "vendor_id":"1ed2", "product_id":"0000", "device_type":"type-PCI", "name":"warboy" }'
      device_spec:
        - '{ "vendor_id": "1ed2", "product_id": "0000" }'
EOF

tee ${OVERRIDES_DIR}/keystone/endpoints.yaml <<EOF
endpoints:
  identity:
    host_fqdn_override:
      public:
        host: "keystone.129-254-202-253.sslip.io"
EOF

tee ${OVERRIDES_DIR}/nova/nova_vncproxy.yaml <<EOF
endpoints:
  compute:
    host_fqdn_override:
      public:
        host: "nova.129-254-202-253.sslip.io"

  compute_console:
    host_fqdn_override:
      public:
        host: "novncproxy.129-254-202-253.sslip.io"

  compute_novnc_proxy:
    host_fqdn_override:
      public:
        host: "novncproxy.129-254-202-253.sslip.io"

conf:
  nova:
    vnc:
      novncproxy_base_url: "http://novncproxy.129-254-202-253.sslip.io/vnc_auto.html"

console:
  console_kind: "novnc"

EOF

helm upgrade --install keystone openstack-helm/keystone \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c keystone endpoints ${FEATURES})

helm upgrade --install nova openstack-helm/nova \
    --namespace=openstack \
    --set bootstrap.wait_for_computes.enabled=true \
    --set conf.ceph.enabled=true \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c nova nova_npu nova_vncproxy ${FEATURES})

kubectl patch ingress novncproxy -n openstack --type='json' \
  -p='[{"op": "replace", "path": "/spec/rules/0/host", "value":"novncproxy.129-254-202-253.sslip.io"}]'

kcloud@kcloud-64:~$ kubectl get ingress -n openstack |grep novnc
novncproxy                nginx           novncproxy.129-254-202-253.sslip.io,novncproxy.openstack,novncproxy.openstack.svc.cluster.local               80      4m3s
```  

```shell
#결국엔 address가 외부 129.254.202.253을 보도록 구성해야함
kcloud@kcloud-64:~$ kubectl get ingress -n openstack
NAME                      CLASS           HOSTS                                                                                               ADDRESS   PORTS   AGE
cinder                    nginx           cinder,cinder.openstack,cinder.openstack.svc.cluster.local                                                    80      24h
cloudformation            nginx           cloudformation,cloudformation.openstack,cloudformation.openstack.svc.cluster.local                            80      24h
glance                    nginx           glance,glance.openstack,glance.openstack.svc.cluster.local                                                    80      24h
heat                      nginx           heat,heat.openstack,heat.openstack.svc.cluster.local                                                          80      24h
horizon                   nginx           horizon,horizon.openstack,horizon.openstack.svc.cluster.local                                                 80      23h
horizon-cluster-fqdn      nginx-cluster   horizon.129-254-202-253.sslip.io                                                                              80      6h2m
horizon-namespace-fqdn    nginx           horizon.129-254-202-253.sslip.io                                                                              80      6h2m
keystone                  nginx           keystone,keystone.openstack,keystone.openstack.svc.cluster.local                                              80      24h
keystone-cluster-fqdn     nginx-cluster   keystone.129-254-202-253.sslip.io                                                                             80      74m
keystone-namespace-fqdn   nginx           keystone.129-254-202-253.sslip.io                                                                             80      74m
metadata                  nginx           metadata,metadata.openstack,metadata.openstack.svc.cluster.local                                              80      24h
neutron                   nginx           neutron,neutron.openstack,neutron.openstack.svc.cluster.local                                                 80      23h
nova                      nginx           nova,nova.openstack,nova.openstack.svc.cluster.local                                                          80      24h
nova-cluster-fqdn         nginx-cluster   nova.129-254-202-253.sslip.io                                                                                 80      72m
nova-namespace-fqdn       nginx           nova.129-254-202-253.sslip.io                                                                                 80      72m
novncproxy                nginx           novncproxy.129-254-202-253.sslip.io,novncproxy.openstack,novncproxy.openstack.svc.cluster.local               80      5m1s
placement                 nginx           placement,placement.openstack,placement.openstack.svc.cluster.local                                           80      24h
rabbitmq-mgr-7b1733       nginx           rabbitmq-mgr-7b1733,rabbitmq-mgr-7b1733.openstack,rabbitmq-mgr-7b1733.openstack.svc.cluster.local             80      24h
```  


## 기존 VM 삭제

```shell
openstack server remove floating ip test-vm 192.168.0.152
openstack server delete test-vm
```  

## 네트워크 구조 확인  

```shell
# 모든 외부 IP는 `169.254.1.1`의 `eth0` 장치로 전달
default via 169.254.1.1 dev eth0
# `169.254.1.1`은 `eth0`을 통해 직접 접근 가능
169.254.1.1 dev eth0 scope link
```  

```shell
# veth, calixxxx 모두 calico가 생성 (veth pair (eth0 - caliXXX)) 
[POD]  eth0 ───── veth ───── caliXXX ───── [HOST]

[Pod]
  └── eth0 (veth pair) ─────┐
                            │
[Host]
  ┌── caliXXXX (veth pair) ◀┘ ← 연결된 쌍 (veth pair)
  └── tunl0 or physical NIC (eno1, ensX 등)
```

`calico_backend: bird` 이면 BGP(BIRD)을 사용해 노드 간에 Pod CIDR 정보를 공유  
169.254.1.1 은 Calico가 생성한 가상 게이트웨이이며, calixxxx에서 Container에서 발생한 패킷을 처리  
BGP 동작은 calico-node-xxxx 가 수행
- 각 Node가 어떤 Pod CIDR을 가지고 있는지 서로에게 광고(BGP advertise)
- 모든 Worker Node는 자기 Pod IP 범위를 BGP로 다른 노드에 알려주고, 다른 노드들의 범위도 학습  
`tunl0`은 calico overlay 인터페이스(Ip-in-IP(터널링))
- 노드 간 encapsulation 수행

```shell
                                  [ VM1 ]
                                   |
                          +----------------+
                          | tap70317abf-88 |
                          +----------------+
                                   |
                            qvo3a6ba134-96
                                   |
                             +-----------+
                             |  br-int   |
                             +-----------+
                              /   |   \    \
                             /    |    \    \
                            /     |     \    \
            qr-8aeb12d0-07      qg-74999a65-90  patch-tun
     (Router internal port)   (Router gateway)    |
                              (to br-ex)          |
                                 |                |
                        int-br-ex (patch)         |
                                 |                |
                            phy-br-ex (patch)     |
                                 |                |
                             +---------+          |
                             |  br-ex  | <--------+
                             +---------+
                                 |
                            [ enp87s0 ]
                        (Physical NIC, Internet)

          patch-int
             |
        +----------+
        |  br-tun  |
        +----------+

# VM 구동 중인 129.254.175.94 (Host)
kcloud@kcloud-94:~$ ip r
default via 129.254.175.1 dev br-ex
10.244.0.192/26 via 129.254.175.93 dev tunl0 proto bird onlink
blackhole 10.244.103.0/26 proto bird
10.244.103.1 dev cali25064212fe9 scope link
10.244.103.2 dev calib3e2562d91c scope link
10.244.103.3 dev calida67d559f7e scope link
10.244.103.4 dev cali727101f9767 scope link
10.244.103.5 dev cali2c376ad42f9 scope link
10.244.103.6 dev cali01cba7f2a52 scope link
10.244.103.7 dev calif8d293dd6e2 scope link
10.244.103.14 dev cali8b7d9cc6fba scope link
10.244.103.15 dev calid4394090115 scope link
10.244.103.16 dev calia0017385e24 scope link
10.244.103.24 dev cali8a409800445 scope link
10.244.103.25 dev califc4ff5bf96b scope link
10.244.103.26 dev cali693226f4bcb scope link
10.244.103.33 dev cali8a3a6abe472 scope link
10.244.103.35 dev caliaf7bfbae38e scope link
10.244.103.41 dev cali408aff957d7 scope link
129.254.175.0/24 dev br-ex proto kernel scope link src 129.254.175.94
172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown

kcloud@kcloud-94:~$ route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         129.254.175.1   0.0.0.0         UG    0      0        0 br-ex
10.244.0.192    129.254.175.93  255.255.255.192 UG    0      0        0 tunl0
10.244.103.0    0.0.0.0         255.255.255.192 U     0      0        0 *
10.244.103.1    0.0.0.0         255.255.255.255 UH    0      0        0 cali25064212fe9
10.244.103.2    0.0.0.0         255.255.255.255 UH    0      0        0 calib3e2562d91c
10.244.103.3    0.0.0.0         255.255.255.255 UH    0      0        0 calida67d559f7e
10.244.103.4    0.0.0.0         255.255.255.255 UH    0      0        0 cali727101f9767
10.244.103.5    0.0.0.0         255.255.255.255 UH    0      0        0 cali2c376ad42f9
10.244.103.6    0.0.0.0         255.255.255.255 UH    0      0        0 cali01cba7f2a52
10.244.103.7    0.0.0.0         255.255.255.255 UH    0      0        0 calif8d293dd6e2
10.244.103.14   0.0.0.0         255.255.255.255 UH    0      0        0 cali8b7d9cc6fba
10.244.103.15   0.0.0.0         255.255.255.255 UH    0      0        0 calid4394090115
10.244.103.16   0.0.0.0         255.255.255.255 UH    0      0        0 calia0017385e24
10.244.103.24   0.0.0.0         255.255.255.255 UH    0      0        0 cali8a409800445
10.244.103.25   0.0.0.0         255.255.255.255 UH    0      0        0 califc4ff5bf96b
10.244.103.26   0.0.0.0         255.255.255.255 UH    0      0        0 cali693226f4bcb
10.244.103.33   0.0.0.0         255.255.255.255 UH    0      0        0 cali8a3a6abe472
10.244.103.35   0.0.0.0         255.255.255.255 UH    0      0        0 caliaf7bfbae38e
10.244.103.41   0.0.0.0         255.255.255.255 UH    0      0        0 cali408aff957d7
129.254.175.0   0.0.0.0         255.255.255.0   U     0      0        0 br-ex
172.17.0.0      0.0.0.0         255.255.0.0     U     0      0        0 docker0
kcloud@kcloud-94:~$ brctl show
bridge name     bridge id               STP enabled     interfaces
docker0         8000.ba6eaaf3d669       no
qbr3a6ba134-96          8000.261f98243035       no              qvb3a6ba134-96
                                                        tap3a6ba134-96
qbrfb88a1f8-ed          8000.32312cd6c1f7       no              qvbfb88a1f8-ed
                                                        tapfb88a1f8-ed
```

```shell
[VM tap 인터페이스]
    ↕︎
[Linux Bridge (qbrXXX)]
    ↕︎
[Open vSwitch (br-int / br-ex)]
    ↕︎
[Host 인터페이스 (예: enp87s0)]
    ↕︎
[외부 네트워크]

# ---

[VM 내부]
 ↳ eth0 (192.168.100.X)
 ↳ ↘ tapXXX → qbrXXX → qvb/qvoXXX
    ↳ Open vSwitch br-int
        ↳ qg-XXX (router의 external interface)
            ↳ patch port → br-ex (외부 브리지)
                ↳ enp87s0 (NIC)
                    ↳ 129.254.175.1 (외부 게이트웨이)

# ---

[VM] ───── qbr ───── ovs ───── qg ───── br-ex ───── [HOST]
```

SNAT (VM->인터넷): qrouter 네임스페이스 안에서 수행
DNAT (인터넷->VM): Floating IP를 통해 수행

```shell
# 아래 출력 중 qrouter-aecd5e69-f4e0-4dd4-9be3-c95b98bc619e 가, Openstack에서 생성한 router1의 네임스페이스(리눅스 네트워크 격리 공간)
kcloud@kcloud-64:~$ kubectl exec -it -n openstack neutron-l3-agent-default-dq28c -- /bin/bash
Defaulted container "neutron-l3-agent" out of: neutron-l3-agent, init (init), neutron-l3-agent-init (init)
neutron@kcloud-94:/$ ip netns
cni-3b7f963c-2330-a29b-f8cb-77d7cb0ce566 (id: 17)
qrouter-aecd5e69-f4e0-4dd4-9be3-c95b98bc619e (id: 16)
qdhcp-e6c05ff6-040d-437e-8877-3b464a4cdca0 (id: 15)
cni-323895b3-1a7c-ebc1-0d11-e63ee6ea0639 (id: 13)
cni-fea9ed7c-58ae-0027-2fda-1b1ae0ba248e (id: 14)
cni-7923a83d-4fb6-5425-18b8-ab9e7c29cf15 (id: 6)
cni-f4e0e7a3-a48a-76b0-8eca-829254830df3 (id: 11)
cni-d6c84894-63d0-b85f-a515-0df41d036510 (id: 12)
cni-598d91a7-51ff-9d17-13fe-508c427f6404 (id: 10)
cni-844c973d-ed95-5246-a2ac-63814a0650b3 (id: 9)
cni-fc549a41-eb65-5e7a-4476-fa4be9b955a9 (id: 8)
cni-cbc6fb94-2ce9-d835-8259-e521cf2781f3 (id: 7)
cni-0273f648-a017-e673-28f3-3ae336e51d2c (id: 5)
cni-6e84ae3c-e5b2-f6a9-e48f-dbf379aca868 (id: 4)
cni-02a682aa-a0c5-e1b2-ef86-456e804d3081 (id: 3)
cni-80751eb4-7347-9232-265a-a88a71319060 (id: 2)
cni-63e7eced-19d8-3beb-4ab5-b3d48e79f455 (id: 1)
cni-cb4b1e58-106f-e0d3-83ab-1966692d5655 (id: 0)
```  

```shell
# 129.254.175.94 (VM 배치된 Worker Node에서 수행)

root@kcloud-94:/home/kcloud# sudo ip netns list
cni-54a6565d-e659-0567-a3ab-a81c5ea664db
cni-3b7f963c-2330-a29b-f8cb-77d7cb0ce566
qrouter-aecd5e69-f4e0-4dd4-9be3-c95b98bc619e
qdhcp-e6c05ff6-040d-437e-8877-3b464a4cdca0
cni-323895b3-1a7c-ebc1-0d11-e63ee6ea0639
cni-fea9ed7c-58ae-0027-2fda-1b1ae0ba248e
cni-7923a83d-4fb6-5425-18b8-ab9e7c29cf15
cni-f4e0e7a3-a48a-76b0-8eca-829254830df3
cni-d6c84894-63d0-b85f-a515-0df41d036510
cni-598d91a7-51ff-9d17-13fe-508c427f6404
cni-844c973d-ed95-5246-a2ac-63814a0650b3
cni-fc549a41-eb65-5e7a-4476-fa4be9b955a9
cni-cbc6fb94-2ce9-d835-8259-e521cf2781f3
cni-0273f648-a017-e673-28f3-3ae336e51d2c
cni-6e84ae3c-e5b2-f6a9-e48f-dbf379aca868
cni-02a682aa-a0c5-e1b2-ef86-456e804d3081
cni-80751eb4-7347-9232-265a-a88a71319060
cni-63e7eced-19d8-3beb-4ab5-b3d48e79f455
cni-cb4b1e58-106f-e0d3-83ab-1966692d5655
root@kcloud-94:/home/kcloud# sudo ip netns exec qrouter-aecd5e69-f4e0-4dd4-9be3-c95b98bc619e bash
root@kcloud-94:/home/kcloud# ip netns exec qrouter-aecd5e69-f4e0-4dd4-9be3-c95b98bc619e ip r
default via 192.168.0.1 dev qg-74999a65-90 proto static
192.168.0.0/24 dev qg-74999a65-90 proto kernel scope link src 192.168.0.124
192.168.100.0/24 dev qr-8aeb12d0-07 proto kernel scope link src 192.168.100.1
root@kcloud-94:/home/kcloud# ip netns exec qrouter-aecd5e69-f4e0-4dd4-9be3-c95b98bc619e ip a
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host
       valid_lft forever preferred_lft forever
2: tunl0@NONE: <NOARP> mtu 1480 qdisc noop state DOWN group default qlen 1000
    link/ipip 0.0.0.0 brd 0.0.0.0
59: qg-74999a65-90: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UNKNOWN group default qlen 1000
    link/ether fa:16:3e:d1:83:32 brd ff:ff:ff:ff:ff:ff
    inet 192.168.0.124/24 brd 192.168.0.255 scope global qg-74999a65-90
       valid_lft forever preferred_lft forever
    inet 192.168.0.196/32 brd 192.168.0.196 scope global qg-74999a65-90
       valid_lft forever preferred_lft forever
    inet 192.168.0.146/32 brd 192.168.0.146 scope global qg-74999a65-90
       valid_lft forever preferred_lft forever
    inet6 fe80::f816:3eff:fed1:8332/64 scope link
       valid_lft forever preferred_lft forever
60: qr-8aeb12d0-07: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UNKNOWN group default qlen 1000
    link/ether fa:16:3e:c5:8c:d4 brd ff:ff:ff:ff:ff:ff
    inet 192.168.100.1/24 brd 192.168.100.255 scope global qr-8aeb12d0-07
       valid_lft forever preferred_lft forever
    inet6 fe80::f816:3eff:fec5:8cd4/64 scope link
       valid_lft forever preferred_lft forever
root@kcloud-94:/home/kcloud# ip netns exec qrouter-aecd5e69-f4e0-4dd4-9be3-c95b98bc619e iptables -t nat -L -n -v
Chain PREROUTING (policy ACCEPT 1999K packets, 1128M bytes)
 pkts bytes target     prot opt in     out     source               destination
1999K 1128M neutron-l3-agent-PREROUTING  all  --  *      *       0.0.0.0/0            0.0.0.0/0

Chain INPUT (policy ACCEPT 0 packets, 0 bytes)
 pkts bytes target     prot opt in     out     source               destination

Chain OUTPUT (policy ACCEPT 0 packets, 0 bytes)
 pkts bytes target     prot opt in     out     source               destination
    0     0 neutron-l3-agent-OUTPUT  all  --  *      *       0.0.0.0/0            0.0.0.0/0

Chain POSTROUTING (policy ACCEPT 0 packets, 0 bytes)
 pkts bytes target     prot opt in     out     source               destination
11685  783K neutron-l3-agent-POSTROUTING  all  --  *      *       0.0.0.0/0            0.0.0.0/0
11685  783K neutron-postrouting-bottom  all  --  *      *       0.0.0.0/0            0.0.0.0/0

Chain neutron-l3-agent-OUTPUT (1 references)
 pkts bytes target     prot opt in     out     source               destination
    0     0 DNAT       all  --  *      *       0.0.0.0/0            192.168.0.196        to:192.168.100.114
    0     0 DNAT       all  --  *      *       0.0.0.0/0            192.168.0.146        to:192.168.100.190

Chain neutron-l3-agent-POSTROUTING (1 references)
 pkts bytes target     prot opt in     out     source               destination
    0     0 ACCEPT     all  --  *      !qg-74999a65-90  0.0.0.0/0            0.0.0.0/0            ! ctstate DNAT

Chain neutron-l3-agent-PREROUTING (1 references)
 pkts bytes target     prot opt in     out     source               destination
    0     0 REDIRECT   tcp  --  qr-+   *       0.0.0.0/0            169.254.169.254      redir ports 9697
    0     0 DNAT       all  --  *      *       0.0.0.0/0            192.168.0.196        to:192.168.100.114
    0     0 DNAT       all  --  *      *       0.0.0.0/0            192.168.0.146        to:192.168.100.190

Chain neutron-l3-agent-float-snat (1 references)
 pkts bytes target     prot opt in     out     source               destination
 6020  402K SNAT       all  --  *      *       192.168.100.114      0.0.0.0/0            to:192.168.0.196 random-fully
 4897  328K SNAT       all  --  *      *       192.168.100.190      0.0.0.0/0            to:192.168.0.146 random-fully

Chain neutron-l3-agent-snat (1 references)
 pkts bytes target     prot opt in     out     source               destination
11685  783K neutron-l3-agent-float-snat  all  --  *      *       0.0.0.0/0            0.0.0.0/0
  277 19846 SNAT       all  --  *      qg-74999a65-90  0.0.0.0/0            0.0.0.0/0            to:192.168.0.124 random-fully
    0     0 SNAT       all  --  *      *       0.0.0.0/0            0.0.0.0/0            ctstate DNAT to:192.168.0.124 random-fully

Chain neutron-postrouting-bottom (1 references)
 pkts bytes target     prot opt in     out     source               destination
11685  783K neutron-l3-agent-snat  all  --  *      *       0.0.0.0/0            0.0.0.0/0            /* Perform source NAT on outgoing traffic. */
root@kcloud-94:/home/kcloud# ip netns exec qrouter-aecd5e69-f4e0-4dd4-9be3-c95b98bc619e ping 1.1.1.1 -c 3
PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
From 192.168.0.1 icmp_seq=1 Destination Net Unreachable
From 192.168.0.1 icmp_seq=2 Destination Net Unreachable
From 192.168.0.1 icmp_seq=3 Destination Net Unreachable

--- 1.1.1.1 ping statistics ---
3 packets transmitted, 0 received, +3 errors, 100% packet loss, time 2037ms
```  

```shell
[VM:192.168.100.X]
   |
   | (tap -> qbr -> qvb -> qvo -> br-int)
   |
[br-int] --- [patch port] --- [br-ex] --- enpXXX --- [외부 스위치]
   |
 [router1 namespace]
   | qr-* (private GW) 192.168.100.1
   | qg-* (public SNAT) 192.168.0.124 + floating IPs
```  

📕 위 과정 중, openstack 명령어로 생성하는 public-net은 129.254.175.0/24 대역으로 생성해야 한다. 
- 실제로 floating IP는 외부 네트워크와 통신하기 위한 공인 아이피를 제공받도록 되어있다. (현재는)

- Floating IP는 129.254.175.101 처럼 외부에서 접근 가능한 IP
- router1이 DNAT: 129.254.175.101 → 192.168.100.10
- router1이 SNAT: 192.168.100.10 → 129.254.175.101

```shell
     [VM: 192.168.100.10]
             │
      (private-net / qr-xxx)
             │
         [router1]
      (qg-xxx: 129.254.175.124)
             │
       [br-ex on Host]
             │
   ┌────────────┐
   │ 인터넷     │
   └────────────┘
```

## 노드 추가(241)

```shell
# 129.254.175.93 
sudo kubeadm token create --print-join-command

# ex) 출력예
kcloud@kcloud-93:~$ sudo kubeadm token create --print-join-command
kubeadm join 129.254.175.93:6443 --token udd5sc.fk5busdw97jo9sqs --discovery-token-ca-cert-hash sha256:0cfaba642181f40c2b747f6fbd5e49828f245a74f7e101450c099b5b470e5a99
```

```shell
# 129.254.202.64
vim ~/osh/openstack-helm/roles/deploy-env/tasks/main.yaml
## > Join workload nodes to cluster 수정
- name: Join workload nodes to cluster
  command: "{{ join_command }}"
  when: inventory_hostname in (groups['k8s_nodes'] | default([]))
  #  command: "{{ (groups['k8s_control_plane'] | map('extract', hostvars, ['join_command', 'stdout_lines', 0]))[0] }}"
  #when: inventory_hostname in (groups['k8s_nodes'] | default([]))

vim ~/osh/openstack-helm/roles/deploy-env/tasks/client_cluster_tunnel.yaml
## > Set Client IP 수정
- name: Set client IP
  set_fact:
    client_default_ip: "{{ client_default_ip | default((groups['primary'] | map('extract', hostvars, ['ansible_default_ipv4', 'address']))[0]) }}"
    #client_default_ip: "{{ (groups['primary'] | map('extract', hostvars, ['ansible_default_ipv4', 'address']))[0] }}"

ansible-playbook -i inventory.yaml deploy-env.yaml \
  --limit=node-3 \
  --extra-vars "join_command='kubeadm join 129.254.175.93:6443 --token udd5sc.fk5busdw97jo9sqs --discovery-token-ca-cert-hash sha256:0cfaba642181f40c2b747f6fbd5e49828f245a74f7e101450c099b5b470e5a99' cluster_default_ip=129.254.175.93 client_default_ip=129.254.202.64"

ansible-playbook -i inventory.yaml deploy-env.yaml --limit=node-3

kubectl label --overwrite nodes --all openstack-control-plane=enabled
kubectl label --overwrite nodes kcloud-241 openstack-compute-node=enabled
kubectl label --overwrite nodes kcloud-241 openvswitch=enabled

cat << EOF > overrides/neutron/neutron_node241.yaml
conf:
  neutron:
    auto_bridge_add:
      br-ex@kcloud-241: eno1
EOF

helm upgrade neutron openstack-helm/neutron \
  --namespace=openstack \
  --reuse-values \
  $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c neutron neutron_simple ${FEATURES}) \
  --values overrides/neutron/neutron_node241.yaml
```
