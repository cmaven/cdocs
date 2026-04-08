---
title: Openstack Helm Quick Guide
description: "Openstack Helm Quick Guide"
---


--- 

```shell
##-- All Nodes
sudo visudo  
##-- 내용 작성 >
kcloud ALL=(ALL) NOPASSWD:ALL
```

# Kubernetes Worker Nodes

--- 

## PCI Passthorugh

```shell
lspci -nnk | grep -i nvidia
##-- > 출력 예 (NVIDIA A30)
18:00.0 3D controller [0302]: NVIDIA Corporation GA100GL [A30 PCIe] [10de:20b7] (rev a1)
        Subsystem: NVIDIA Corporation GA100GL [A30 PCIe] [10de:1532]
        Kernel modules: nvidiafb, nouveau

##-- > 출력 예 (Furiosa Worboy)
lspci -nnk | grep -i furiosa
af:00.0 Processing accelerators [1200]: FuriosaAI, Inc. Warboy [1ed2:0000] (rev 01)
        Subsystem: FuriosaAI, Inc. Warboy [1ed2:0000]

sudo vim /etc/default/grub
##-- > 아래 내용으로 수정
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash intel_iommu=on vfio-pci.ids=10de:20b7,1ed2:0000"

cat <<EOF | sudo tee /etc/modprobe.d/vfio.conf
softdep nvidia pre: vfio-pci
options vfio-pci ids=10de:20b7,1ed2:0000
EOF

cat <<EOF | sudo tee /etc/modprobe.d/blacklist-nvidia.conf
blacklist nouveau
blacklist nvidiafb
EOF

cat << EOF | sudo tee -a /etc/modules-load.d/modules.conf
vfio
vfio_iommu_type1
vfio_pci
EOF

sudo update-initramfs -u
sudo update-grub
sudo reboot
```

## Rename network device

```shell
ip link show

##-- ex) 1c:69:7a:0a:6d:ee 값 추출
root@kcloud-93:~# ip link show
...
2: eno1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000
    link/ether 1c:69:7a:0a:6d:ee brd ff:ff:ff:ff:ff:ff
    altname enp0s31f6

vim  /etc/netplan/00-installer-config.yaml
##-- > match, macaddress, set-name 추가
network:
  ethernets:
    eno1:
      addresses:
      - 129.254.175.93/24
      gateway4: 129.254.175.1
      nameservers:
        addresses:
        - 129.254.16.61
        search:
        - 8.8.8.8
      match:
        macaddress: 1c:69:7a:0a:6d:ee
      set-name: eno1
  version: 2


netplan apply
```


# Primary Node

--- 

```shell
apt install python3-pip

ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
ssh-copy-id -i ~/.ssh/id_rsa.pub kcloud@129.254.202.64
ssh-copy-id -i ~/.ssh/id_rsa.pub kcloud@129.254.175.93
ssh-copy-id -i ~/.ssh/id_rsa.pub kcloud@129.254.175.94
ssh-copy-id -i ~/.ssh/id_rsa.pub kcloud@129.254.202.241


mkdir helm
cd helm

curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh

helm repo add openstack-helm https://tarballs.opendev.org/openstack/openstack-helm
helm plugin install https://opendev.org/openstack/openstack-helm-plugin


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
##-- 내용 작성 >
[defaults]
roles_path = ~/osh/openstack-helm/roles:~/osh/zuul-jobs/roles

##-- 환경에 따라 hosts 부분 primary, node-1, node-2, node-3 수정
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
##-- 아래 Register public wireguard key variable 추가 >
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
...
##-- -----------------------------------------------------------------------------

vim ~osh/openstack-helm/roles/deploy-env/tasks/client_cluster_ssh.yaml
##-- 아래 Save ssh public key to hostvars 추가, 아래 Set primary ssh public key 수정 > 
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
...
##-- -----------------------------------------------------------------------------

cd ~/osh
ansible-playbook -i inventory.yaml deploy-env.yaml
```  


```shell
tee > /tmp/openstack_namespace.yaml <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: openstack
EOF

kubectl apply -f /tmp/openstack_namespace.yaml


helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
##-- 외부 접근 허용 시는, --set controller.service.enabled="true" 로 실행
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
    - "129.254.202.253-129.254.202.253"
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
    metallb.universe.tf/loadBalancerIPs: "129.254.202.253"
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
kubectl label --overwrite nodes kcloud-241 kcloud-242 openvswitch=enabled


cd ~osh
vim ./openstack-helm/tools/deployment/ceph/ceph-rook.sh
##-- Worker Node의 수에 맞게, count 변경
##-- Worker Node가 3개 이상일 경우, count: 3, allowMultiplePerNode: false > 
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
```

```shell
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
```  

```shell
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
```  

```shell
##-- ceph keyring 복사 작업 추가 (_storage-init.st.tpl)
vim ~/osh/openstack-helm/cinder/templates/bin/_storage-init.st.tpl
##-- 아래 echo "[INFO] 부분 추가 >
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

kubectl -n ceph exec deploy/rook-ceph-tools -- cat /etc/ceph/ceph.conf > ceph.conf
kubectl -n openstack delete configmap ceph-etc
kubectl -n openstack create configmap ceph-etc --from-file=ceph.conf=ceph.conf


kubectl -n ceph exec deploy/rook-ceph-tools -- \
  ceph auth get client.admin > ceph.client.admin.keyring
kubectl delete secret pvc-ceph-client-key -n openstack
kubectl create secret generic pvc-ceph-client-key \
  --from-file=key=ceph.client.admin.keyring \
  -n openstack


helm upgrade --install cinder openstack-helm/cinder \
    --namespace=openstack \
    --timeout=600s \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c cinder ${FEATURES})

helm osh wait-for-pods openstack
```  

```shell
helm upgrade --install openvswitch openstack-helm/openvswitch \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c openvswitch ${FEATURES})

helm osh wait-for-pods openstack


vim ~/osh/openstack-helm/libvirt/templates/bin/_ceph-keyring.sh.tpl
##-- libvirt의 경우 Ceph Keyring 문제가 Cinder와 같이 발생, 아래 부분을 추가함
##-- export HOME=/tmp 밑부터, cp -fv 위까지 내용 추가 >
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


##-- GPU 
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

##-- NPU
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
        - '{ "vendor_id":"1ed2", "product_id":"0000", "device_type":"type-PCI", "name":"warboy" }'
      device_spec:
        - '{ "vendor_id": "1ed2", "product_id": "0000" }'
EOF

##-- compute console, novnc_proxy
tee ${OVERRIDES_DIR}/nova/nova_console.yaml <<EOF
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


helm upgrade --install nova openstack-helm/nova \
    --namespace=openstack \
    --set bootstrap.wait_for_computes.enabled=true \
    --set conf.ceph.enabled=true \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c nova nova_gpu nova_console ${FEATURES})



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


tee ${OVERRIDES_DIR}/horizon/horizon_extranl.yaml << EOF
endpoints:
  dashboard:
    host_fqdn_override:
      public:
        host: "horizon.129-254-202-253.sslip.io"
EOF

helm upgrade --install horizon openstack-helm/horizon \
    --namespace=openstack \
    $(helm osh get-values-overrides -p ${OVERRIDES_DIR} -c horizon endpoints ${FEATURES})

helm osh wait-for-pods openstack
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
```

```shell
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
```

이미지 준비
- [jammy-server-cloudimg-amd64.img](https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img)  

```shell
openstack image create "ubuntu22.04" \
  --file jammy-server-cloudimg-amd64.img \
  --disk-format qcow2 \
  --container-format bare \
  --public

##-- 생성 VM ID:PASSWORD 접근 설정 (ubuntu:ubuntu)
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
```

```shell
##-- GPU VM
openstack flavor create a30.small --vcpus 2 --ram 2048 --disk 20 --property "pci_passthrough:alias"="a30:1"

openstack security group list

##-- default security-group의 id 활용
openstack server create test-gpu \
  --image ubuntu22.04 \
  --flavor a30.small \
  --network private-net \
  --key-name mykey \
  --user-data ubuntu-user-data.yaml \
  --security-group 74adfb75-75b0-46f1-92c6-e60b345a84be

openstack server show test-gpu
openstack floating ip create public-net
openstack server add floating ip test-gpu 192.168.0.188
```  

```shell
##-- NPU VM
openstack flavor create warboy.small --vcpus 2 --ram 2048 --disk 20 --property "pci_passthrough:alias"="warboy:1"

openstack security group list

openstack server create test-npu \
  --image ubuntu22.04 \
  --flavor warboy.small \
  --network private-net \
  --key-name mykey \
  --user-data ubuntu-user-data.yaml \
  --security-group 74adfb75-75b0-46f1-92c6-e60b345a84be

openstack server show test-npu
openstack floating ip create public-net
openstack server add floating ip test-npu 192.168.0.189
```

```shell
##-- Normal VM
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
openstack server add floating ip test-vm 192.168.0.152
```  