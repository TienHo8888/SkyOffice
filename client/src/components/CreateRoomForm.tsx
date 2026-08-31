import styled from 'styled-components'

const DisabledMessage = styled.p`
  width: 320px;
  color: #eee;
  text-align: center;
`

export const CreateRoomForm = () => (
  <DisabledMessage>Custom room creation is currently disabled.</DisabledMessage>
)
